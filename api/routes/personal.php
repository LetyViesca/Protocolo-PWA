<?php
require_once __DIR__ . "/../config/session.php";
require_once __DIR__ . "/../config/Database.php";

use Config\Database;

function findAssociationMember(PDO $connection, array $director, int $memberId): ?array {
    $statement = $connection->prepare(
        "SELECT u.id_usuario, u.correo, u.nombre, u.apellido_paterno, u.apellido_materno,
            COALESCE(NULLIF(e.nombre_completo, ''), NULLIF(u.nombre_completo, ''), TRIM(CONCAT_WS(' ', u.nombre, u.apellido_paterno, u.apellido_materno))) AS nombre_completo,
            COALESCE(e.fecha_nacimiento, u.fecha_nacimiento) AS fecha_nacimiento,
            COALESCE(e.tipo_sangre, u.tipo_sangre) AS tipo_sangre,
            COALESCE(NULLIF(e.alergias, ''), u.alergias) AS alergias,
            COALESCE(NULLIF(e.padecimientos, ''), u.padecimientos) AS padecimientos,
            COALESCE(NULLIF(e.contacto_emergencia_nombre, ''), u.contacto_emergencia_nombre) AS contacto_emergencia_nombre,
            COALESCE(NULLIF(e.contacto_emergencia_telefono, ''), u.contacto_emergencia_telefono) AS contacto_emergencia_telefono
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
        ":association_id" => $director["id_asociacion"],
        ":director_id" => $director["id_usuario"],
    ]);
    $member = $statement->fetch();
    return $member ?: null;
}

try {
    $connection = Database::getConnection();
    $director = requireAuthenticatedUser($connection);
    if (!userIsManager($director) || empty($director["id_asociacion"])) {
        respondJson(403, ["status" => "forbidden", "mensaje" => "Solo el Director puede consultar expedientes de su asociación"]);
    }
    if (strtoupper(trim((string)$director["estatus_aprobado"])) !== "APROBADO") {
        respondJson(403, ["status" => "forbidden", "mensaje" => "La cuenta Director no está aprobada"]);
    }
    ensureUserPersonalColumns($connection);

    $method = $_SERVER["REQUEST_METHOD"] ?? "GET";
    if ($method === "GET") {
        $memberId = filter_input(INPUT_GET, "id_usuario", FILTER_VALIDATE_INT);
        if (!$memberId && isset($_GET["email"])) {
            $email = filter_var($_GET["email"], FILTER_VALIDATE_EMAIL);
            if (!$email) respondJson(400, ["status" => "error", "mensaje" => "El correo no es válido"]);
            $idQuery = $connection->prepare(
                "SELECT id_usuario FROM Usuario WHERE correo = :email AND id_asociacion = :association_id LIMIT 1"
            );
            $idQuery->execute([":email" => $email, ":association_id" => $director["id_asociacion"]]);
            $memberId = (int)$idQuery->fetchColumn();
        }
        if (!$memberId && isset($_GET["correo"])) {
            $email = filter_var($_GET["correo"], FILTER_VALIDATE_EMAIL);
            if (!$email) respondJson(400, ["status" => "error", "mensaje" => "El correo no es válido"]);
            $idQuery = $connection->prepare(
                "SELECT id_usuario FROM Usuario WHERE correo = :email AND id_asociacion = :association_id LIMIT 1"
            );
            $idQuery->execute([":email" => $email, ":association_id" => $director["id_asociacion"]]);
            $memberId = (int)$idQuery->fetchColumn();
        }
        if (!$memberId || $memberId < 1) {
            respondJson(400, ["status" => "error", "mensaje" => "Se requiere un id_usuario válido o correo"]);
        }
        $member = findAssociationMember($connection, $director, $memberId);
        if (!$member) {
            respondJson(404, ["status" => "not_found", "mensaje" => "El usuario no es un miembro operativo aprobado de tu asociación"]);
        }
        respondJson(200, ["success" => true, "status" => "success", "usuario" => $member, "expediente" => $member]);
    }

    if ($method === "POST" || $method === "PUT") {
        $data = json_decode(file_get_contents("php://input"), true);
        if (!is_array($data)) {
            respondJson(400, ["status" => "error", "mensaje" => "El cuerpo de la solicitud no es válido"]);
        }
        $memberId = filter_var($data["id_usuario"] ?? null, FILTER_VALIDATE_INT);
        $email = filter_var($data["email"] ?? $data["correo"] ?? null, FILTER_VALIDATE_EMAIL);
        if ((!$memberId || $memberId < 1) && $email) {
            $idQuery = $connection->prepare(
                "SELECT id_usuario FROM Usuario WHERE correo = :email AND id_asociacion = :association_id LIMIT 1"
            );
            $idQuery->execute([":email" => $email, ":association_id" => $director["id_asociacion"]]);
            $memberId = (int)$idQuery->fetchColumn();
        }
        $fullName = trim((string)($data["nombreCompleto"] ?? $data["nombre_completo"] ?? ""));
        $birthDateRaw = trim((string)($data["fechaNacimiento"] ?? $data["fecha_nacimiento"] ?? ""));
        $bloodType = strtoupper(trim((string)($data["tipoSangre"] ?? $data["tipo_sangre"] ?? "")));
        $allowedBloodTypes = ["", "A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
        if (!$memberId || $memberId < 1 || $fullName === "" || mb_strlen($fullName) > 150 || !in_array($bloodType, $allowedBloodTypes, true)) {
            respondJson(400, ["status" => "error", "mensaje" => "Revisa nombre completo y tipo de sangre"]);
        }
        $birthDate = null;
        if ($birthDateRaw !== "") {
            $parsedDate = DateTime::createFromFormat("!Y-m-d", $birthDateRaw);
            if (!$parsedDate || $parsedDate->format("Y-m-d") !== $birthDateRaw || $parsedDate > new DateTime("today")) {
                respondJson(400, ["status" => "error", "mensaje" => "La fecha de nacimiento no es válida"]);
            }
            $birthDate = $birthDateRaw;
        }
        if (!findAssociationMember($connection, $director, $memberId)) {
            respondJson(404, ["status" => "not_found", "mensaje" => "El usuario no es un miembro operativo aprobado de tu asociación"]);
        }
        $connection->beginTransaction();
        try {
            $save = $connection->prepare(
                "UPDATE Usuario
                 SET nombre_completo = :full_name,
                     fecha_nacimiento = :birth_date,
                     tipo_sangre = :blood_type,
                     alergias = :allergies,
                     padecimientos = :conditions,
                     contacto_emergencia_nombre = :contact_name,
                     contacto_emergencia_telefono = :contact_phone
                 WHERE id_usuario = :member_id AND id_asociacion = :association_id"
            );
            $save->execute([
                ":member_id" => $memberId,
                ":association_id" => $director["id_asociacion"],
                ":full_name" => $fullName,
                ":birth_date" => $birthDate,
                ":blood_type" => $bloodType ?: null,
                ":allergies" => trim((string)($data["alergias"] ?? "")) ?: null,
                ":conditions" => trim((string)($data["padecimientos"] ?? "")) ?: null,
                ":contact_name" => mb_substr(trim((string)($data["contactoNombre"] ?? $data["contacto_emergencia_nombre"] ?? "")), 0, 150) ?: null,
                ":contact_phone" => mb_substr(trim((string)($data["contactoTelefono"] ?? $data["contacto_emergencia_telefono"] ?? "")), 0, 30) ?: null,
            ]);
            $saveExpediente = $connection->prepare(
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
            $saveExpediente->execute([
                ":member_id" => $memberId,
                ":association_id" => $director["id_asociacion"],
                ":full_name" => $fullName,
                ":birth_date" => $birthDate,
                ":blood_type" => $bloodType ?: null,
                ":allergies" => trim((string)($data["alergias"] ?? "")) ?: null,
                ":conditions" => trim((string)($data["padecimientos"] ?? "")) ?: null,
                ":contact_name" => mb_substr(trim((string)($data["contactoNombre"] ?? $data["contacto_emergencia_nombre"] ?? "")), 0, 150) ?: null,
                ":contact_phone" => mb_substr(trim((string)($data["contactoTelefono"] ?? $data["contacto_emergencia_telefono"] ?? "")), 0, 30) ?: null,
            ]);
            $connection->commit();
        } catch (Throwable $error) {
            if ($connection->inTransaction()) $connection->rollBack();
            throw $error;
        }
        $updatedRecord = findAssociationMember($connection, $director, $memberId);
        respondJson(200, [
            "success" => true,
            "status" => "success",
            "mensaje" => "Ficha personal guardada correctamente",
            "usuario" => $updatedRecord,
            "expediente" => $updatedRecord,
        ]);
    }

    respondJson(405, ["status" => "error", "mensaje" => "Método no permitido"]);
} catch (Throwable $error) {
    error_log("Error en personal.php: " . $error->getMessage());
    respondJson(500, ["status" => "error", "mensaje" => "No se pudo procesar el expediente personal"]);
}