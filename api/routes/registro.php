<?php
require_once "../config/cors.php";
require_once __DIR__ . "/../config/session.php";
require_once "../config/Database.php";
require_once "../models/Asociacion.php";

use Models\Asociacion;
use Config\Database;

$data = json_decode(file_get_contents("php://input"), true);

if (!is_array($data)) {
    http_response_code(400);
    echo json_encode(["status" => "error", "mensaje" => "Datos inválidos"]);
    exit;
}

try {
    if (($data["tipo"] ?? "") === "usuario") {
        $name = trim((string)($data["nombre"] ?? ""));
        $email = trim((string)($data["correo"] ?? ""));
        $password = is_string($data["contrasena"] ?? null) ? $data["contrasena"] : "";
        $phone = trim((string)($data["telefono"] ?? ""));
        $birthDateRaw = trim((string)($data["fecha_nacimiento"] ?? ""));
        $bloodType = strtoupper(trim((string)($data["tipo_sangre"] ?? "")));
        $allowedBloodTypes = ["", "A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

        if ($name === "" || mb_strlen($name) > 50 || !filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($password) < 8 || !in_array($bloodType, $allowedBloodTypes, true)) {
            http_response_code(400);
            echo json_encode(["status" => "error", "mensaje" => "Nombre, correo válido, contraseña y tipo de sangre válidos son obligatorios"]);
            exit;
        }
        $birthDate = null;
        if ($birthDateRaw !== "") {
            $parsedDate = DateTime::createFromFormat("!Y-m-d", $birthDateRaw);
            if (!$parsedDate || $parsedDate->format("Y-m-d") !== $birthDateRaw || $parsedDate > new DateTime("today")) {
                http_response_code(400);
                echo json_encode(["status" => "error", "mensaje" => "La fecha de nacimiento no es válida"]);
                exit;
            }
            $birthDate = $birthDateRaw;
        }

        $contrasena_hash = password_hash($password, PASSWORD_BCRYPT);
        if ($contrasena_hash === false) {
            throw new \RuntimeException("No se pudo proteger la contraseña.");
        }

        $connection = Database::getConnection();
        ensureUserPersonalColumns($connection);
        $statement = $connection->prepare(
            "INSERT INTO Usuario
                (id_asociacion, id_rol, nombre, apellido_paterno, apellido_materno, nombre_completo, correo, telefono,
                 contrasena_hash, fecha_nacimiento, tipo_sangre, alergias, padecimientos,
                 contacto_emergencia_nombre, contacto_emergencia_telefono, estatus_aprobado)
             VALUES
                (1, 2, :nombre, '', '', :nombre_completo, :correo, :telefono, :contrasena_hash, :fecha_nacimiento,
                 :tipo_sangre, :alergias, :padecimientos, :contacto_nombre, :contacto_telefono, 'SIN_SOLICITUD')"
        );
        $statement->execute([
            ":nombre" => $name,
            ":nombre_completo" => $name,
            ":correo" => $email,
            ":telefono" => mb_substr($phone, 0, 20) ?: null,
            ":contrasena_hash" => $contrasena_hash,
            ":fecha_nacimiento" => $birthDate,
            ":tipo_sangre" => $bloodType ?: null,
            ":alergias" => trim((string)($data["alergias"] ?? "")) ?: null,
            ":padecimientos" => trim((string)($data["padecimientos"] ?? "")) ?: null,
            ":contacto_nombre" => mb_substr(trim((string)($data["contacto_emergencia_nombre"] ?? "")), 0, 150) ?: null,
            ":contacto_telefono" => mb_substr(trim((string)($data["contacto_emergencia_telefono"] ?? "")), 0, 30) ?: null,
        ]);

        http_response_code(201);
        echo json_encode([
            "status" => "success",
            "mensaje" => "Cuenta creada correctamente",
            "id_usuario" => $connection->lastInsertId(),
        ]);
        exit;
    }

    $model = new Asociacion();
    $resultado = $model->registrar($data);
    http_response_code(201);
    echo json_encode($resultado);
} catch (InvalidArgumentException $e) {
    http_response_code(400);
    echo json_encode(["status" => "error", "mensaje" => $e->getMessage()]);
} catch (PDOException $e) {
    if ($e->getCode() === "23000" && (int)($e->errorInfo[1] ?? 0) === 1062) {
        http_response_code(409);
        echo json_encode(["status" => "error", "mensaje" => "Ya existe una cuenta registrada con ese correo"]);
        exit;
    }
    error_log("Error en registro.php: " . $e->getMessage());
    http_response_code(500);
    echo json_encode(["status" => "error", "mensaje" => "No se pudo completar el registro"]);
} catch (\Exception $e) {
    error_log("Error en registro.php: " . $e->getMessage());
    http_response_code(500);
    echo json_encode(["status" => "error", "mensaje" => "No se pudo completar el registro"]);
}
?>