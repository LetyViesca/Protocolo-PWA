<?php
require_once __DIR__ . "/../config/session.php";
require_once __DIR__ . "/../config/Database.php";

use Config\Database;

try {
    $method = $_SERVER["REQUEST_METHOD"] ?? "GET";
    $connection = Database::getConnection();

    if ($method === "GET") {
        $currentUser = requireAuthenticatedUser($connection);
        $requestedEmail = filter_input(INPUT_GET, "correo", FILTER_VALIDATE_EMAIL);

        if (isset($_GET["expediente"])) {
            if (!userIsManager($currentUser) || empty($currentUser["id_asociacion"])) {
                respondJson(403, ["status" => "forbidden", "mensaje" => "Solo el Director puede consultar expedientes de su asociación"]);
            }
            $memberId = filter_input(INPUT_GET, "expediente", FILTER_VALIDATE_INT);
            if (!$memberId || $memberId < 1) {
                respondJson(400, ["status" => "error", "mensaje" => "El ID del usuario no es válido"]);
            }
            $connection->exec(
                "CREATE TABLE IF NOT EXISTS expediente_personal (
                    id_usuario INT NOT NULL PRIMARY KEY,
                    id_asociacion INT NOT NULL,
                    nombre_completo VARCHAR(150) NOT NULL,
                    fecha_nacimiento DATE NULL,
                    tipo_sangre VARCHAR(5) NULL,
                    alergias TEXT NULL,
                    padecimientos TEXT NULL,
                    contacto_emergencia_nombre VARCHAR(150) NULL,
                    contacto_emergencia_telefono VARCHAR(30) NULL,
                    fecha_actualizacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    INDEX idx_expediente_asociacion (id_asociacion)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
            );
            $statement = $connection->prepare(
                "SELECT u.id_usuario, u.correo,
                        COALESCE(NULLIF(e.nombre_completo, ''), TRIM(CONCAT_WS(' ', u.nombre, u.apellido_paterno, u.apellido_materno))) AS nombre_completo,
                        e.fecha_nacimiento, e.tipo_sangre, e.alergias, e.padecimientos,
                        e.contacto_emergencia_nombre, e.contacto_emergencia_telefono
                 FROM Usuario u
                 LEFT JOIN expediente_personal e ON e.id_usuario = u.id_usuario AND e.id_asociacion = u.id_asociacion
                 LEFT JOIN roles_usuario r ON r.id_rol = u.id_rol
                 WHERE u.id_usuario = :member_id
                   AND u.id_asociacion = :association_id
                   AND UPPER(TRIM(u.estatus_aprobado)) = 'APROBADO'
                   AND u.id_usuario <> :director_id
                   AND u.id_rol NOT IN (1, 5)
                   AND UPPER(TRIM(COALESCE(r.nombre_rol, ''))) NOT IN ('DIRECTOR', 'ADMINISTRADOR')
                 LIMIT 1"
            );
            $statement->execute([
                ":member_id" => $memberId,
                ":association_id" => $currentUser["id_asociacion"],
                ":director_id" => $currentUser["id_usuario"],
            ]);
            $record = $statement->fetch();
            if (!$record) {
                respondJson(404, ["status" => "not_found", "mensaje" => "El miembro no pertenece a tu asociación"]);
            }
            respondJson(200, ["status" => "success", "expediente" => $record]);
        }

        if ($requestedEmail) {
            if (strcasecmp($requestedEmail, (string)$currentUser["correo"]) !== 0) {
                respondJson(403, ["status" => "forbidden", "mensaje" => "No puedes consultar el estado de otra cuenta"]);
            }

            $statement = $connection->prepare(
                "SELECT id_usuario, correo, id_asociacion, estatus_aprobado, id_rol
                 FROM Usuario
                 WHERE id_usuario = :user_id
                 LIMIT 1"
            );
            $statement->execute([":user_id" => $currentUser["id_usuario"]]);
            $user = $statement->fetch();
            if (!$user) {
                respondJson(404, ["status" => "not_found", "mensaje" => "No existe el usuario autenticado"]);
            }
            respondJson(200, ["status" => "success", "usuario" => $user]);
        }

        if (!userIsManager($currentUser)) {
            respondJson(403, ["status" => "forbidden", "mensaje" => "Solo el Director puede consultar solicitudes"]);
        }
        $associationId = filter_input(INPUT_GET, "id_asociacion", FILTER_VALIDATE_INT);
        $sessionAssociationId = (int)($currentUser["id_asociacion"] ?? 0);
        if (!$associationId || $associationId !== $sessionAssociationId) {
            respondJson(403, ["status" => "forbidden", "mensaje" => "No tienes acceso a las solicitudes de esa asociación"]);
        }
        ensureUserPersonalColumns($connection);

        $statement = $connection->prepare(
            "SELECT u.id_usuario, u.correo, u.estatus_aprobado, u.id_rol, r.nombre_rol,
                COALESCE(NULLIF(u.nombre_completo, ''), NULLIF(e.nombre_completo, ''), TRIM(CONCAT_WS(' ', u.nombre, u.apellido_paterno, u.apellido_materno))) AS nombre_completo,
                u.nombre, u.apellido_paterno, u.apellido_materno,
                COALESCE(u.fecha_nacimiento, e.fecha_nacimiento) AS fecha_nacimiento,
                COALESCE(u.tipo_sangre, e.tipo_sangre) AS tipo_sangre,
                COALESCE(NULLIF(u.alergias, ''), e.alergias) AS alergias,
                COALESCE(NULLIF(u.padecimientos, ''), e.padecimientos) AS padecimientos,
                COALESCE(NULLIF(u.contacto_emergencia_nombre, ''), e.contacto_emergencia_nombre) AS contacto_emergencia_nombre,
                COALESCE(NULLIF(u.contacto_emergencia_telefono, ''), e.contacto_emergencia_telefono) AS contacto_emergencia_telefono,
                    (SELECT GROUP_CONCAT(p.modulo_permiso SEPARATOR ',')
                     FROM permisos_especiales_usuario p
                     WHERE p.id_usuario = u.id_usuario) AS permisos_guardados
             FROM Usuario u
             LEFT JOIN roles_usuario r ON r.id_rol = u.id_rol
             LEFT JOIN expediente_personal e ON e.id_usuario = u.id_usuario AND e.id_asociacion = u.id_asociacion
             WHERE u.id_asociacion = :association_id
               AND UPPER(TRIM(u.estatus_aprobado)) = 'PENDIENTE'
             ORDER BY u.id_usuario"
        );
        $statement->execute([":association_id" => $associationId]);
        $pendingRequests = $statement->fetchAll();
        $statement = $connection->prepare(
            "SELECT u.id_usuario, u.correo, u.estatus_aprobado, u.id_rol, r.nombre_rol,
                COALESCE(NULLIF(u.nombre_completo, ''), NULLIF(e.nombre_completo, ''), TRIM(CONCAT_WS(' ', u.nombre, u.apellido_paterno, u.apellido_materno))) AS nombre_completo,
                u.nombre, u.apellido_paterno, u.apellido_materno,
                COALESCE(u.fecha_nacimiento, e.fecha_nacimiento) AS fecha_nacimiento,
                COALESCE(u.tipo_sangre, e.tipo_sangre) AS tipo_sangre,
                COALESCE(NULLIF(u.alergias, ''), e.alergias) AS alergias,
                COALESCE(NULLIF(u.padecimientos, ''), e.padecimientos) AS padecimientos,
                COALESCE(NULLIF(u.contacto_emergencia_nombre, ''), e.contacto_emergencia_nombre) AS contacto_emergencia_nombre,
                COALESCE(NULLIF(u.contacto_emergencia_telefono, ''), e.contacto_emergencia_telefono) AS contacto_emergencia_telefono,
                    (SELECT GROUP_CONCAT(p.modulo_permiso SEPARATOR ',')
                     FROM permisos_especiales_usuario p
                     WHERE p.id_usuario = u.id_usuario) AS permisos_guardados
             FROM Usuario u
             LEFT JOIN roles_usuario r ON r.id_rol = u.id_rol
             LEFT JOIN expediente_personal e ON e.id_usuario = u.id_usuario AND e.id_asociacion = u.id_asociacion
             WHERE u.id_asociacion = :association_id
                             AND u.id_usuario <> :current_user_id
               AND UPPER(TRIM(u.estatus_aprobado)) = 'APROBADO'
             ORDER BY u.id_usuario"
        );
                $statement->execute([
                        ":association_id" => $associationId,
                        ":current_user_id" => $currentUser["id_usuario"],
                ]);
        $members = $statement->fetchAll();
        $normalizeRows = static function (array $rows): array {
            return array_map(static function (array $row): array {
                $row["permisos"] = $row["permisos_guardados"]
                    ? explode(",", (string)$row["permisos_guardados"])
                    : [];
                unset($row["permisos_guardados"]);
                return $row;
            }, $rows);
        };
        $roleStatement = $connection->query(
            "SELECT id_rol, nombre_rol
             FROM roles_usuario
             WHERE id_rol NOT IN (1, 5)
               AND UPPER(TRIM(nombre_rol)) NOT IN ('DIRECTOR', 'ADMINISTRADOR')
             ORDER BY nombre_rol"
        );
        respondJson(200, [
            "status" => "success",
            "solicitudes" => $normalizeRows($pendingRequests),
            "miembros" => $normalizeRows($members),
            "roles" => $roleStatement->fetchAll(),
        ]);
    }

    if ($method === "POST") {
        $currentUser = requireAuthenticatedUser($connection);
        $data = json_decode(file_get_contents("php://input"), true);
        $email = is_array($data) && is_string($data["correo"] ?? null) ? trim($data["correo"]) : "";
        $invitationCode = is_array($data) && is_string($data["codigo_invitacion"] ?? null)
            ? strtoupper(trim($data["codigo_invitacion"]))
            : "";
        if ($email === "" || !filter_var($email, FILTER_VALIDATE_EMAIL) || $invitationCode === "") {
            respondJson(400, ["status" => "error", "mensaje" => "Correo y código de invitación válidos son obligatorios"]);
        }
        if (strcasecmp($email, (string)$currentUser["correo"]) !== 0) {
            respondJson(403, ["status" => "forbidden", "mensaje" => "La solicitud debe enviarse con la cuenta autenticada"]);
        }
        if (userIsManager($currentUser)) {
            respondJson(403, ["status" => "forbidden", "mensaje" => "La cuenta Director no puede solicitar vinculación operativa"]);
        }

        $associationQuery = $connection->prepare(
            "SELECT id_asociacion, nombre_asociacion, codigo_invitacion
             FROM asociaciones
             WHERE UPPER(TRIM(codigo_invitacion)) = :invitation_code
             LIMIT 1"
        );
        $associationQuery->execute([":invitation_code" => $invitationCode]);
        $association = $associationQuery->fetch();
        if (!$association) {
            respondJson(404, ["status" => "not_found", "mensaje" => "Código de invitación no encontrado"]);
        }

        $update = $connection->prepare(
            "UPDATE Usuario
             SET id_asociacion = :association_id, estatus_aprobado = 'PENDIENTE'
             WHERE id_usuario = :user_id
               AND UPPER(TRIM(estatus_aprobado)) <> 'APROBADO'"
        );
        $update->execute([
            ":association_id" => $association["id_asociacion"],
            ":user_id" => $currentUser["id_usuario"],
        ]);

        $userQuery = $connection->prepare(
            "SELECT id_usuario, correo, id_asociacion, estatus_aprobado, id_rol
             FROM Usuario
             WHERE id_usuario = :user_id
             LIMIT 1"
        );
        $userQuery->execute([":user_id" => $currentUser["id_usuario"]]);
        $user = $userQuery->fetch();
        if (!$user) {
            respondJson(404, ["status" => "not_found", "mensaje" => "No existe el usuario autenticado"]);
        }
        if (strtoupper(trim((string)$user["estatus_aprobado"])) === "APROBADO") {
            respondJson(409, ["status" => "conflict", "mensaje" => "El usuario ya está aprobado"]);
        }

        respondJson(200, [
            "status" => "success",
            "mensaje" => "Solicitud registrada como pendiente",
            "asociacion" => $association,
            "solicitud" => $user,
        ]);
    }

    if ($method === "PUT") {
        $currentUser = requireAuthenticatedUser($connection);
        $data = json_decode(file_get_contents("php://input"), true);
        if (!is_array($data)) {
            respondJson(400, ["status" => "error", "mensaje" => "El cuerpo de la solicitud no es válido"]);
        }
        $isManager = userIsManager($currentUser);
        $validateOperationalRole = static function (mixed $candidate) use ($connection): array {
            $roleId = filter_var($candidate, FILTER_VALIDATE_INT);
            if (!$roleId || $roleId < 1 || in_array($roleId, [1, 5], true)) {
                respondJson(400, ["status" => "error", "mensaje" => "Selecciona un rol operativo válido"]);
            }
            $roleQuery = $connection->prepare(
                "SELECT id_rol, nombre_rol FROM roles_usuario WHERE id_rol = :role_id LIMIT 1"
            );
            $roleQuery->execute([":role_id" => $roleId]);
            $role = $roleQuery->fetch();
            if (!$role || in_array(strtoupper(trim((string)$role["nombre_rol"])), ["DIRECTOR", "ADMINISTRADOR"], true)) {
                respondJson(400, ["status" => "error", "mensaje" => "Selecciona un rol operativo válido"]);
            }
            return $role;
        };

        if (($data["accion"] ?? "") === "actualizar_expediente") {
            if (!$isManager || empty($currentUser["id_asociacion"])) {
                respondJson(403, ["status" => "forbidden", "mensaje" => "Solo el Director puede guardar expedientes de su asociación"]);
            }
            $memberId = filter_var($data["id_usuario"] ?? null, FILTER_VALIDATE_INT);
            $fullName = trim((string)($data["nombre_completo"] ?? ""));
            $birthDateRaw = trim((string)($data["fecha_nacimiento"] ?? ""));
            $bloodType = strtoupper(trim((string)($data["tipo_sangre"] ?? "")));
            $allowedBloodTypes = ["", "A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
            if (!$memberId || $memberId < 1 || $fullName === "" || mb_strlen($fullName) > 150 || !in_array($bloodType, $allowedBloodTypes, true)) {
                respondJson(400, ["status" => "error", "mensaje" => "Revisa nombre completo y tipo de sangre"]);
            }
            $birthDate = null;
            if ($birthDateRaw !== "") {
                $parsedDate = \DateTime::createFromFormat("!Y-m-d", $birthDateRaw);
                if (!$parsedDate || $parsedDate->format("Y-m-d") !== $birthDateRaw || $parsedDate > new \DateTime("today")) {
                    respondJson(400, ["status" => "error", "mensaje" => "La fecha de nacimiento no es válida"]);
                }
                $birthDate = $birthDateRaw;
            }
            $memberCheck = $connection->prepare(
                "SELECT u.id_usuario
                 FROM Usuario u
                 LEFT JOIN roles_usuario r ON r.id_rol = u.id_rol
                 WHERE u.id_usuario = :member_id
                   AND u.id_asociacion = :association_id
                   AND UPPER(TRIM(u.estatus_aprobado)) = 'APROBADO'
                   AND u.id_usuario <> :director_id
                   AND u.id_rol NOT IN (1, 5)
                   AND UPPER(TRIM(COALESCE(r.nombre_rol, ''))) NOT IN ('DIRECTOR', 'ADMINISTRADOR')
                 LIMIT 1"
            );
            $memberCheck->execute([
                ":member_id" => $memberId,
                ":association_id" => $currentUser["id_asociacion"],
                ":director_id" => $currentUser["id_usuario"],
            ]);
            if (!$memberCheck->fetch()) {
                respondJson(404, ["status" => "not_found", "mensaje" => "El miembro no pertenece a tu asociación"]);
            }
            $connection->exec(
                "CREATE TABLE IF NOT EXISTS expediente_personal (
                    id_usuario INT NOT NULL PRIMARY KEY,
                    id_asociacion INT NOT NULL,
                    nombre_completo VARCHAR(150) NOT NULL,
                    fecha_nacimiento DATE NULL,
                    tipo_sangre VARCHAR(5) NULL,
                    alergias TEXT NULL,
                    padecimientos TEXT NULL,
                    contacto_emergencia_nombre VARCHAR(150) NULL,
                    contacto_emergencia_telefono VARCHAR(30) NULL,
                    fecha_actualizacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    INDEX idx_expediente_asociacion (id_asociacion)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
            );
            $save = $connection->prepare(
                "INSERT INTO expediente_personal
                    (id_usuario, id_asociacion, nombre_completo, fecha_nacimiento, tipo_sangre, alergias, padecimientos,
                     contacto_emergencia_nombre, contacto_emergencia_telefono)
                 VALUES (:member_id, :association_id, :full_name, :birth_date, :blood_type, :allergies, :conditions, :contact_name, :contact_phone)
                 ON DUPLICATE KEY UPDATE
                    id_asociacion = VALUES(id_asociacion), nombre_completo = VALUES(nombre_completo),
                    fecha_nacimiento = VALUES(fecha_nacimiento), tipo_sangre = VALUES(tipo_sangre),
                    alergias = VALUES(alergias), padecimientos = VALUES(padecimientos),
                    contacto_emergencia_nombre = VALUES(contacto_emergencia_nombre),
                    contacto_emergencia_telefono = VALUES(contacto_emergencia_telefono)"
            );
            $save->execute([
                ":member_id" => $memberId,
                ":association_id" => $currentUser["id_asociacion"],
                ":full_name" => $fullName,
                ":birth_date" => $birthDate,
                ":blood_type" => $bloodType ?: null,
                ":allergies" => trim((string)($data["alergias"] ?? "")) ?: null,
                ":conditions" => trim((string)($data["padecimientos"] ?? "")) ?: null,
                ":contact_name" => mb_substr(trim((string)($data["contacto_emergencia_nombre"] ?? "")), 0, 150) ?: null,
                ":contact_phone" => mb_substr(trim((string)($data["contacto_emergencia_telefono"] ?? "")), 0, 30) ?: null,
            ]);
            respondJson(200, ["status" => "success", "mensaje" => "Expediente actualizado"]);
        }

        if (($data["accion"] ?? "") === "actualizar_miembro") {
            if (!$isManager || empty($currentUser["id_asociacion"])) {
                respondJson(403, ["status" => "forbidden", "mensaje" => "Solo el Director puede modificar miembros de su asociación"]);
            }
            $userId = filter_var($data["id_usuario"] ?? null, FILTER_VALIDATE_INT);
            if (!$userId || $userId < 1) {
                respondJson(400, ["status" => "error", "mensaje" => "id_usuario no es válido"]);
            }
            $role = $validateOperationalRole($data["id_rol"] ?? null);
            $memberQuery = $connection->prepare(
                "SELECT u.id_usuario, u.id_rol, r.nombre_rol
                 FROM Usuario u
                 LEFT JOIN roles_usuario r ON r.id_rol = u.id_rol
                 WHERE u.id_usuario = :user_id
                   AND u.id_asociacion = :association_id
                   AND UPPER(TRIM(u.estatus_aprobado)) = 'APROBADO'
                 LIMIT 1"
            );
            $memberQuery->execute([
                ":user_id" => $userId,
                ":association_id" => $currentUser["id_asociacion"],
            ]);
            $member = $memberQuery->fetch();
            if (!$member) {
                respondJson(404, ["status" => "not_found", "mensaje" => "No se encontró un miembro aprobado de tu asociación"]);
            }
            $memberRoleName = strtoupper(trim((string)($member["nombre_rol"] ?? "")));
            if (
                (int)$member["id_usuario"] === (int)$currentUser["id_usuario"]
                || in_array((int)$member["id_rol"], [1, 5], true)
                || in_array($memberRoleName, ["DIRECTOR", "ADMINISTRADOR"], true)
            ) {
                respondJson(403, ["status" => "forbidden", "mensaje" => "No puedes modificar la cuenta del Director o Administrador"]);
            }
            $permissionFields = [
                "ver_campo" => "campo_ver",
                "modificar_campo" => "campo_modificar",
                "ver_despacho" => "despacho_ver",
                "modificar_despacho" => "despacho_modificar",
                "ver_almacen" => "almacen_ver",
                "modificar_almacen" => "almacen_modificar",
                "acceso_reportes" => "reportes_ver",
            ];
            $permissions = [];
            foreach ($permissionFields as $field => $permission) {
                if (!array_key_exists($field, $data) || !is_bool($data[$field])) {
                    respondJson(400, ["status" => "error", "mensaje" => "Falta un valor válido para el permiso " . $field]);
                }
                if ($data[$field]) {
                    $permissions[] = $permission;
                }
            }

            $connection->beginTransaction();
            $update = $connection->prepare(
                "UPDATE Usuario
                 SET id_rol = :role_id
                 WHERE id_usuario = :user_id
                   AND id_asociacion = :association_id
                   AND UPPER(TRIM(estatus_aprobado)) = 'APROBADO'"
            );
            $update->execute([
                ":role_id" => $role["id_rol"],
                ":user_id" => $userId,
                ":association_id" => $currentUser["id_asociacion"],
            ]);
            if ($update->rowCount() === 0) {
                $memberQuery = $connection->prepare(
                    "SELECT id_usuario FROM Usuario
                     WHERE id_usuario = :user_id
                       AND id_asociacion = :association_id
                       AND UPPER(TRIM(estatus_aprobado)) = 'APROBADO'
                     LIMIT 1"
                );
                $memberQuery->execute([
                    ":user_id" => $userId,
                    ":association_id" => $currentUser["id_asociacion"],
                ]);
                if (!$memberQuery->fetch()) {
                    $connection->rollBack();
                    respondJson(404, ["status" => "not_found", "mensaje" => "No se encontró un miembro aprobado de tu asociación"]);
                }
            }
            $deletePermissions = $connection->prepare(
                "DELETE FROM permisos_especiales_usuario WHERE id_usuario = :user_id"
            );
            $deletePermissions->execute([":user_id" => $userId]);
            $grant = $connection->prepare(
                "INSERT INTO permisos_especiales_usuario (id_usuario, modulo_permiso, asignado_por_usuario)
                 VALUES (:user_id, :permission, :assigned_by)"
            );
            foreach (array_merge(["permissions_configured"], $permissions) as $permission) {
                $grant->execute([
                    ":user_id" => $userId,
                    ":permission" => $permission,
                    ":assigned_by" => $currentUser["id_usuario"],
                ]);
            }
            $connection->commit();
            respondJson(200, [
                "status" => "success",
                "mensaje" => "Permisos actualizados correctamente",
                "id_usuario" => $userId,
                "id_rol" => $role["id_rol"],
                "nombre_rol" => $role["nombre_rol"],
            ]);
        }

        $requestedStatus = is_array($data) && is_string($data["estatus_aprobado"] ?? null)
            ? strtoupper(trim($data["estatus_aprobado"]))
            : "";

        if (!$isManager && $requestedStatus === "SIN_SOLICITUD") {
            $cancel = $connection->prepare(
                "UPDATE Usuario
                 SET estatus_aprobado = 'SIN_SOLICITUD'
                 WHERE id_usuario = :user_id
                   AND UPPER(TRIM(estatus_aprobado)) = 'PENDIENTE'"
            );
            $cancel->execute([":user_id" => $currentUser["id_usuario"]]);
            if ($cancel->rowCount() === 0) {
                $currentStatusQuery = $connection->prepare(
                    "SELECT estatus_aprobado FROM Usuario WHERE id_usuario = :user_id LIMIT 1"
                );
                $currentStatusQuery->execute([":user_id" => $currentUser["id_usuario"]]);
                $currentStatus = $currentStatusQuery->fetch();
                if (!$currentStatus || strtoupper(trim((string)$currentStatus["estatus_aprobado"])) !== "SIN_SOLICITUD") {
                    respondJson(409, ["status" => "conflict", "mensaje" => "La solicitud ya no está pendiente"]);
                }
            }
            $_SESSION["authenticated_user"]["estatus_aprobado"] = "SIN_SOLICITUD";
            respondJson(200, [
                "status" => "success",
                "mensaje" => "Solicitud cancelada",
                "id_usuario" => $currentUser["id_usuario"],
                "estatus_aprobado" => "SIN_SOLICITUD",
            ]);
        }

        if (!$isManager || empty($currentUser["id_asociacion"])) {
            respondJson(403, ["status" => "forbidden", "mensaje" => "Solo el Director de la asociación puede resolver solicitudes"]);
        }
        $userId = is_array($data) ? filter_var($data["id_usuario"] ?? null, FILTER_VALIDATE_INT) : false;
        $status = in_array($requestedStatus, ["RECHAZADA", "RECHAZADO"], true)
            ? "SIN_SOLICITUD"
            : $requestedStatus;
        if (!$userId || $userId < 1 || !in_array($status, ["APROBADO", "SIN_SOLICITUD"], true)) {
            respondJson(400, ["status" => "error", "mensaje" => "id_usuario y un estado APROBADO o SIN_SOLICITUD son obligatorios"]);
        }
        $allowedPermissions = [
            "campo_ver", "campo_modificar", "despacho_ver", "despacho_modificar",
            "almacen_ver", "almacen_modificar", "reportes_ver",
        ];
        $permissions = is_array($data["permisos"] ?? null) ? array_values(array_unique($data["permisos"])) : [];
        foreach ($permissions as $permission) {
            if (!is_string($permission) || !in_array($permission, $allowedPermissions, true)) {
                respondJson(400, ["status" => "error", "mensaje" => "La lista de permisos contiene un valor inválido"]);
            }
        }

        $connection->beginTransaction();
        $update = $connection->prepare(
            "UPDATE Usuario
             SET estatus_aprobado = :status
             WHERE id_usuario = :user_id
               AND id_asociacion = :association_id
               AND UPPER(TRIM(estatus_aprobado)) = 'PENDIENTE'"
        );
        $update->execute([
            ":status" => $status,
            ":user_id" => $userId,
            ":association_id" => $currentUser["id_asociacion"],
        ]);
        if ($update->rowCount() === 0) {
            $check = $connection->prepare(
                "SELECT estatus_aprobado FROM Usuario
                 WHERE id_usuario = :user_id AND id_asociacion = :association_id"
            );
            $check->execute([
                ":user_id" => $userId,
                ":association_id" => $currentUser["id_asociacion"],
            ]);
            $user = $check->fetch();
            if (!$user) {
                $connection->rollBack();
                respondJson(404, ["status" => "not_found", "mensaje" => "No existe la solicitud en tu asociación"]);
            }
            if (strtoupper(trim((string)$user["estatus_aprobado"])) !== $status) {
                $connection->rollBack();
                respondJson(409, ["status" => "conflict", "mensaje" => "La solicitud ya no está pendiente"]);
            }
        }

        $deletePermissions = $connection->prepare(
            "DELETE FROM permisos_especiales_usuario WHERE id_usuario = :user_id"
        );
        $deletePermissions->execute([":user_id" => $userId]);
        if ($status === "APROBADO") {
            $grant = $connection->prepare(
                "INSERT INTO permisos_especiales_usuario (id_usuario, modulo_permiso, asignado_por_usuario)
                 VALUES (:user_id, :permission, :assigned_by)"
            );
            foreach (array_merge(["permissions_configured"], $permissions) as $permission) {
                $grant->execute([
                    ":user_id" => $userId,
                    ":permission" => $permission,
                    ":assigned_by" => $currentUser["id_usuario"],
                ]);
            }
        }
        $connection->commit();

        respondJson(200, [
            "status" => "success",
            "mensaje" => $status === "APROBADO" ? "Usuario aprobado" : "Solicitud eliminada o rechazada",
            "id_usuario" => $userId,
            "estatus_aprobado" => $status,
        ]);
    }

    respondJson(405, ["status" => "error", "mensaje" => "Método no permitido"]);
} catch (Throwable $error) {
    if (isset($connection) && $connection instanceof PDO && $connection->inTransaction()) {
        $connection->rollBack();
    }
    error_log("Error en solicitudes.php: " . $error->getMessage());
    respondJson(500, ["status" => "error", "mensaje" => "Error interno al procesar la solicitud"]);
}
