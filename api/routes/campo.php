<?php
require_once "../config/cors.php";
require_once "../config/Database.php";
require_once "../models/ReporteCampo.php";

use Models\ReporteCampo;

$data = json_decode(file_get_contents("php://input"), true);

if (!$data) {
    http_response_code(400);
    echo json_encode(["status" => "error", "mensaje" => "Datos de reporte vacíos"]);
    exit;
}

try {
    $model = new ReporteCampo();
    $res = $model->guardarReporte($data);
    echo json_encode($res);
} catch (\Exception $e) {
    http_response_code(500);
    echo json_encode(["status" => "error", "mensaje" => "Error interno: " . $e->getMessage()]);
}
?>