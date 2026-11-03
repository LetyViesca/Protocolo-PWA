<?php
require_once __DIR__ . "/../config/session.php";
require_once __DIR__ . "/../config/Database.php";

use Config\Database;

function publicUser(array $user, PDO $connection): array {
    $publicUser = [
        "id_usuario" => $user["id_usuario"],
        "correo" => $user["correo"],
        "id_asociacion" => $user["id_asociacion"] ?? null,
        "id_rol" => $user["id_rol"],
        "esDirector" => in_array((int)($user["id_rol"] ?? 0), [1, 5], true)
            || in_array(strtoupper(trim((string)($user["nombre_rol"] ?? ""))), ["DIRECTOR", "ADMINISTRADOR"], true),
        "nombre_rol" => $user["nombre_rol"] ?? null,
        "estatus_aprobado" => $user["estatus_aprobado"] ?? "",
        "nombre_asociacion" => $user["nombre_asociacion"] ?? null,
        "codigo_invitacion" => $user["codigo_invitacion"] ?? null,
    ];
    $publicUser["permisos"] = userPermissionNames($connection, (int)$user["id_usuario"]);
    return $publicUser;
}

try {
    startAppSession();
    $method = $_SERVER["REQUEST_METHOD"] ?? "GET";

    if ($method === "GET") {
        $sessionUser = $_SESSION["authenticated_user"] ?? null;
        if (!is_array($sessionUser) || !isset($sessionUser["id_usuario"])) {
            respondJson(200, ["status" => "success", "authenticated" => false]);
        }

        $statement = Database::getConnection()->prepare(
            "SELECT u.id_usuario, u.correo, u.id_asociacion, u.id_rol, u.estatus_aprobado, r.nombre_rol,
                    a.nombre_asociacion, a.codigo_invitacion
             FROM Usuario u
             LEFT JOIN roles_usuario r ON r.id_rol = u.id_rol
             LEFT JOIN asociaciones a ON a.id_asociacion = u.id_asociacion
             WHERE u.id_usuario = :user_id
             LIMIT 1"
        );
        $statement->execute([":user_id" => $sessionUser["id_usuario"]]);
        $user = $statement->fetch();
        if (!$user) {
            $_SESSION = [];
            session_destroy();
            respondJson(200, ["status" => "success", "authenticated" => false]);
        }

        $user = publicUser($user, Database::getConnection());
        $_SESSION["authenticated_user"] = $user;
        respondJson(200, ["status" => "success", "authenticated" => true, "usuario" => $user]);
    }

    if ($method === "POST") {
        $data = json_decode(file_get_contents("php://input"), true);
        $email = is_array($data) && is_string($data["correo"] ?? null) ? trim($data["correo"]) : "";
        $password = is_array($data) && is_string($data["contrasena"] ?? null) ? $data["contrasena"] : "";
        if (!filter_var($email, FILTER_VALIDATE_EMAIL) || $password === "") {
            respondJson(400, ["status" => "error", "mensaje" => "Correo y contraseña son obligatorios"]);
        }

        $statement = Database::getConnection()->prepare(
            "SELECT u.id_usuario, u.correo, u.contrasena_hash, u.id_asociacion, u.id_rol, u.estatus_aprobado, r.nombre_rol,
                    a.nombre_asociacion, a.codigo_invitacion
             FROM Usuario u
             LEFT JOIN roles_usuario r ON r.id_rol = u.id_rol
             LEFT JOIN asociaciones a ON a.id_asociacion = u.id_asociacion
             WHERE u.correo = :email
             LIMIT 1"
        );
        $statement->execute([":email" => $email]);
        $user = $statement->fetch();
        if (!$user || !password_verify($password, (string)$user["contrasena_hash"])) {
            respondJson(401, ["status" => "unauthorized", "mensaje" => "Correo o contraseña incorrectos"]);
        }

        session_regenerate_id(true);
        $user = publicUser($user, Database::getConnection());
        $_SESSION["authenticated_user"] = $user;
        respondJson(200, ["status" => "success", "authenticated" => true, "usuario" => $user]);
    }

    if ($method === "DELETE") {
        $_SESSION = [];
        if (ini_get("session.use_cookies")) {
            $cookie = session_get_cookie_params();
            setcookie(session_name(), "", [
                "expires" => time() - 42000,
                "path" => $cookie["path"],
                "domain" => $cookie["domain"],
                "secure" => $cookie["secure"],
                "httponly" => $cookie["httponly"],
                "samesite" => "Lax",
            ]);
        }
        session_destroy();
        respondJson(200, ["status" => "success", "authenticated" => false]);
    }

    respondJson(405, ["status" => "error", "mensaje" => "Método no permitido"]);
} catch (Throwable $error) {
    error_log("Error en auth.php: " . $error->getMessage());
    respondJson(500, ["status" => "error", "mensaje" => "Error interno de autenticación"]);
}
