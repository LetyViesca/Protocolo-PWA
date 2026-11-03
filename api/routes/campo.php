<?php
require_once __DIR__ . "/../config/session.php";
require_once __DIR__ . "/../config/Database.php";
require_once __DIR__ . "/../models/ReporteCampo.php";

use Config\Database;
use Models\ReporteCampo;

try {
    $method = $_SERVER["REQUEST_METHOD"] ?? "GET";
    if ($method === "GET") {
        $connection = Database::getConnection();
        $user = requireAuthenticatedUser($connection);
        if (strtoupper(trim((string)$user["estatus_aprobado"])) !== "APROBADO" || empty($user["id_asociacion"])) {
            respondJson(403, ["status" => "forbidden", "mensaje" => "La cuenta no tiene acceso aprobado a Campo"]);
        }
        if (!userCanAccess($connection, $user, "campo_ver") && !userCanAccess($connection, $user, "campo_modificar")) {
            requireUserPermission($connection, $user, "campo_ver");
        }
        $units = $connection->prepare(
            "SELECT nombre_unidad FROM unidades
             WHERE id_asociacion = :association_id
             ORDER BY nombre_unidad"
        );
        $units->execute([":association_id" => $user["id_asociacion"]]);
        respondJson(200, ["status" => "success", "unidades" => $units->fetchAll()]);
    }
    if ($method !== "POST") {
        respondJson(405, ["status" => "error", "mensaje" => "Método no permitido"]);
    }
    $connection = Database::getConnection();
    $user = requireAuthenticatedUser($connection);
    if (strtoupper(trim((string)$user["estatus_aprobado"])) !== "APROBADO") {
        respondJson(403, ["status" => "forbidden", "mensaje" => "La cuenta aún no tiene aprobación"]);
    }
    if (
        !userCanAccess($connection, $user, "campo_ver")
        && !userCanAccess($connection, $user, "campo_modificar")
    ) {
        requireUserPermission($connection, $user, "campo_modificar");
    }
    $reportPayload = $_POST["reporte"] ?? file_get_contents("php://input");
    $data = json_decode((string)$reportPayload, true);
    if (!is_array($data)) {
        respondJson(400, ["status" => "error", "mensaje" => "Datos de reporte inválidos"]);
    }

    $model = new ReporteCampo();
    respondJson(201, $model->guardarReporte($data, $user, $_FILES["evidencias"] ?? []));
} catch (InvalidArgumentException $error) {
    respondJson(400, ["status" => "error", "mensaje" => $error->getMessage()]);
} catch (RuntimeException $error) {
    respondJson(409, ["status" => "conflict", "mensaje" => $error->getMessage()]);
} catch (Throwable $error) {
    error_log("Error en campo.php: " . $error->getMessage());
    respondJson(500, ["status" => "error", "mensaje" => "No se pudo guardar el reporte"]);
}
