<?php
require_once __DIR__ . "/cors.php";

function startAppSession(): void {
    if (session_status() === PHP_SESSION_ACTIVE) {
        return;
    }

    session_set_cookie_params([
        "httponly" => true,
        "secure" => !empty($_SERVER["HTTPS"]) && $_SERVER["HTTPS"] !== "off",
        "samesite" => "Lax",
        "path" => "/",
    ]);
    session_start();
}

function respondJson(int $statusCode, array $payload): void {
    http_response_code($statusCode);
    echo json_encode($payload);
    exit;
}

function requireAuthenticatedUser(PDO $connection): array {
    startAppSession();
    $user = $_SESSION["authenticated_user"] ?? null;
    if (!is_array($user) || !isset($user["id_usuario"], $user["correo"])) {
        respondJson(401, ["status" => "unauthorized", "mensaje" => "Inicia sesión para continuar"]);
    }
    $statement = $connection->prepare(
        "SELECT u.id_usuario, u.correo, u.id_asociacion, u.id_rol, u.estatus_aprobado, r.nombre_rol
         FROM Usuario u
         LEFT JOIN roles_usuario r ON r.id_rol = u.id_rol
         WHERE u.id_usuario = :user_id
         LIMIT 1"
    );
    $statement->execute([":user_id" => $user["id_usuario"]]);
    $currentUser = $statement->fetch();
    if (!$currentUser) {
        respondJson(401, ["status" => "unauthorized", "mensaje" => "La sesión ya no corresponde a un usuario activo"]);
    }
    $_SESSION["authenticated_user"] = $currentUser;
    return $currentUser;
}

function ensureUserPersonalColumns(PDO $connection): void {
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
    $personalColumns = [
        "nombre_completo" => "VARCHAR(150) NULL",
        "fecha_nacimiento" => "DATE NULL",
        "tipo_sangre" => "VARCHAR(5) NULL",
        "alergias" => "TEXT NULL",
        "padecimientos" => "TEXT NULL",
        "contacto_emergencia_nombre" => "VARCHAR(150) NULL",
        "contacto_emergencia_telefono" => "VARCHAR(30) NULL",
    ];
    $existingColumns = $connection->query("SHOW COLUMNS FROM Usuario")->fetchAll(PDO::FETCH_COLUMN);
    foreach ($personalColumns as $column => $definition) {
        if (!in_array($column, $existingColumns, true)) {
            $connection->exec("ALTER TABLE Usuario ADD COLUMN `" . $column . "` " . $definition);
        }
    }

    $connection->exec(
        "UPDATE Usuario u
         INNER JOIN expediente_personal e
           ON e.id_usuario = u.id_usuario AND e.id_asociacion = u.id_asociacion
         SET u.nombre_completo = COALESCE(NULLIF(u.nombre_completo, ''), e.nombre_completo),
             u.fecha_nacimiento = COALESCE(u.fecha_nacimiento, e.fecha_nacimiento),
             u.tipo_sangre = COALESCE(u.tipo_sangre, e.tipo_sangre),
             u.alergias = COALESCE(NULLIF(u.alergias, ''), e.alergias),
             u.padecimientos = COALESCE(NULLIF(u.padecimientos, ''), e.padecimientos),
             u.contacto_emergencia_nombre = COALESCE(NULLIF(u.contacto_emergencia_nombre, ''), e.contacto_emergencia_nombre),
             u.contacto_emergencia_telefono = COALESCE(NULLIF(u.contacto_emergencia_telefono, ''), e.contacto_emergencia_telefono)
         WHERE e.id_usuario IS NOT NULL"
    );
}

function userIsManager(array $user): bool {
    $roleName = strtoupper(trim((string)($user["nombre_rol"] ?? "")));
    return !empty($user["esDirector"])
        || in_array((int)($user["id_rol"] ?? 0), [1, 5], true)
        || in_array($roleName, ["DIRECTOR", "ADMINISTRADOR"], true);
}

function userPermissionNames(PDO $connection, int $userId): array {
    $statement = $connection->prepare(
        "SELECT modulo_permiso FROM permisos_especiales_usuario WHERE id_usuario = :user_id"
    );
    $statement->execute([":user_id" => $userId]);
    return array_values(array_unique(array_map(
        static fn(array $row): string => (string)$row["modulo_permiso"],
        $statement->fetchAll()
    )));
}

function userCanAccess(PDO $connection, array $user, string $permission): bool {
    if (userIsManager($user)) {
        return true;
    }
    $statement = $connection->prepare(
        "SELECT modulo_permiso FROM permisos_especiales_usuario WHERE id_usuario = :user_id"
    );
    $statement->execute([":user_id" => $user["id_usuario"]]);
    $permissions = $statement->fetchAll(PDO::FETCH_COLUMN);
    if (in_array("permissions_configured", $permissions, true)) {
        return in_array($permission, $permissions, true);
    }

    $legacyRolePermissions = [
        2 => ["campo_ver", "campo_modificar", "almacen_ver"],
        3 => ["almacen_ver", "almacen_modificar"],
        4 => ["campo_ver", "campo_modificar", "despacho_ver", "despacho_modificar", "almacen_ver", "almacen_modificar", "reportes_ver"],
    ];
    return in_array($permission, $legacyRolePermissions[(int)($user["id_rol"] ?? 0)] ?? [], true);
}

function requireUserPermission(PDO $connection, array $user, string $permission): void {
    if (!userCanAccess($connection, $user, $permission)) {
        respondJson(403, ["status" => "forbidden", "mensaje" => "No tienes permiso para realizar esta acción"]);
    }
}
