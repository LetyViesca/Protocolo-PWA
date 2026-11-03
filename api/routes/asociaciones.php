<?php
require_once __DIR__ . "/../config/cors.php";
require_once __DIR__ . "/../config/Database.php";

use Config\Database;

if ($_SERVER["REQUEST_METHOD"] !== "POST") {
    http_response_code(405);
    echo json_encode(["status" => "error", "mensaje" => "Método no permitido"]);
    exit;
}

$data = json_decode(file_get_contents("php://input"), true);
$rawCode = is_array($data) ? ($data["codigo"] ?? "") : "";
$codigo = is_string($rawCode) ? strtoupper(trim($rawCode)) : "";

if ($codigo === "") {
    http_response_code(400);
    echo json_encode(["status" => "error", "mensaje" => "El código de asociación es obligatorio"]);
    exit;
}

try {
    $connection = Database::getConnection();
    $statement = $connection->prepare(
        "SELECT a.id_asociacion, a.nombre_asociacion, a.codigo_invitacion,
                (SELECT u.correo FROM Usuario u
                 WHERE u.id_asociacion = a.id_asociacion AND u.id_rol = 5
                 LIMIT 1) AS directorEmail
         FROM asociaciones a
         WHERE UPPER(TRIM(a.codigo_invitacion)) = :codigo
         LIMIT 1"
    );
    $statement->execute([":codigo" => $codigo]);
    $association = $statement->fetch();

    if (!$association) {
        http_response_code(404);
        echo json_encode(["status" => "not_found", "mensaje" => "Código de asociación no encontrado"]);
        exit;
    }

    echo json_encode(["status" => "success", "asociacion" => $association]);
} catch (\Throwable $error) {
    http_response_code(500);
    error_log("Error al consultar asociación: " . $error->getMessage());
    echo json_encode(["status" => "error", "mensaje" => "No se pudo consultar la asociación"]);
}
