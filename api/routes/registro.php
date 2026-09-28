<?php
require_once "../config/cors.php";
require_once "../config/Database.php";
require_once "../models/Asociacion.php";

use Models\Asociacion;

$data = json_decode(file_get_contents("php://input"), true);

if (!$data) {
    http_response_code(400);
    echo json_encode(["status" => "error", "mensaje" => "Datos inválidos"]);
    exit;
}

try {
    $model = new Asociacion();
    $resultado = $model->registrar($data);
    echo json_encode($resultado);
} catch (\Exception $e) {
    http_response_code(500);
    echo json_encode(["status" => "error", "mensaje" => $e->getMessage()]);
}
?>