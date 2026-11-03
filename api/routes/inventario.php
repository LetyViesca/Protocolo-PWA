<?php
require_once __DIR__ . "/../config/session.php";
require_once __DIR__ . "/../config/Database.php";

use Config\Database;

try {
    $method = $_SERVER["REQUEST_METHOD"] ?? "GET";
    $connection = Database::getConnection();
    $user = requireAuthenticatedUser($connection);
    if (strtoupper(trim((string)$user["estatus_aprobado"])) !== "APROBADO" || empty($user["id_asociacion"])) {
        respondJson(403, ["status" => "forbidden", "mensaje" => "La cuenta no tiene acceso aprobado al inventario"]);
    }
    if ($method === "POST") {
        requireUserPermission($connection, $user, "almacen_modificar");
        $data = json_decode(file_get_contents("php://input"), true);
        if (!is_array($data)) {
            respondJson(400, ["status" => "error", "mensaje" => "Datos de inventario inválidos"]);
        }
        $action = $data["accion"] ?? "alta";
        $associationId = (int)$user["id_asociacion"];
        $allowedUnits = ["AMB-01", "AMB-02", "AMB-03", "BOMBA R-1", "MOTO-01"];

        if ($action === "transferir") {
            $itemId = filter_var($data["id_insumo"] ?? null, FILTER_VALIDATE_INT);
            $quantity = filter_var($data["cantidad"] ?? null, FILTER_VALIDATE_INT);
            $unitName = trim((string)($data["unidad"] ?? ""));
            if ($itemId === false || $itemId < 1 || $quantity === false || $quantity < 1 || $unitName === "") {
                respondJson(400, ["status" => "error", "mensaje" => "Insumo, cantidad y unidad son obligatorios"]);
            }
            $unitQuery = $connection->prepare(
                "SELECT id_unidades FROM unidades
                 WHERE id_asociacion = :association_id AND nombre_unidad = :unit_name LIMIT 1"
            );
            $unitQuery->execute([":association_id" => $associationId, ":unit_name" => $unitName]);
            $unitId = $unitQuery->fetchColumn();
            if (!$unitId && in_array($unitName, $allowedUnits, true)) {
                $createUnit = $connection->prepare(
                    "INSERT INTO unidades (id_asociacion, nombre_unidad) VALUES (:association_id, :unit_name)"
                );
                $createUnit->execute([":association_id" => $associationId, ":unit_name" => $unitName]);
                $unitId = (int)$connection->lastInsertId();
            }
            if (!$unitId) {
                respondJson(404, ["status" => "error", "mensaje" => "La unidad no pertenece a esta asociación"]);
            }

            $connection->beginTransaction();
            try {
                $sourceQuery = $connection->prepare(
                    "SELECT id_ubicacion_stock, cantidad_disponible FROM inventario_ubicacion
                     WHERE id_insumo = :item_id AND tipo_ubicacion = 'BODEGA' AND id_referencia_lugar = :association_id
                     ORDER BY id_ubicacion_stock FOR UPDATE"
                );
                $sourceQuery->execute([":item_id" => $itemId, ":association_id" => $associationId]);
                $sourceRows = $sourceQuery->fetchAll();
                $available = array_sum(array_map(static fn(array $row): int => (int)$row["cantidad_disponible"], $sourceRows));
                if ($available < $quantity) {
                    throw new RuntimeException("Stock insuficiente en Bodega Central para realizar la transferencia.");
                }

                $remaining = $quantity;
                $decrease = $connection->prepare(
                    "UPDATE inventario_ubicacion SET cantidad_disponible = cantidad_disponible - :quantity
                     WHERE id_ubicacion_stock = :stock_id AND cantidad_disponible >= :minimum"
                );
                foreach ($sourceRows as $row) {
                    if ($remaining === 0) break;
                    $deduction = min($remaining, (int)$row["cantidad_disponible"]);
                    if ($deduction < 1) continue;
                    $decrease->execute([
                        ":quantity" => $deduction,
                        ":stock_id" => $row["id_ubicacion_stock"],
                        ":minimum" => $deduction,
                    ]);
                    if ($decrease->rowCount() !== 1) {
                        throw new RuntimeException("El stock de Bodega Central cambió durante la transferencia.");
                    }
                    $remaining -= $deduction;
                }

                $targetQuery = $connection->prepare(
                    "SELECT id_ubicacion_stock FROM inventario_ubicacion
                     WHERE id_insumo = :item_id AND tipo_ubicacion = 'UNIDAD' AND id_referencia_lugar = :unit_id
                     LIMIT 1 FOR UPDATE"
                );
                $targetQuery->execute([":item_id" => $itemId, ":unit_id" => $unitId]);
                $targetId = $targetQuery->fetchColumn();
                if ($targetId) {
                    $increase = $connection->prepare(
                        "UPDATE inventario_ubicacion SET cantidad_disponible = cantidad_disponible + :quantity
                         WHERE id_ubicacion_stock = :stock_id"
                    );
                    $increase->execute([":quantity" => $quantity, ":stock_id" => $targetId]);
                } else {
                    $insert = $connection->prepare(
                        "INSERT INTO inventario_ubicacion (id_insumo, tipo_ubicacion, id_referencia_lugar, cantidad_disponible)
                         VALUES (:item_id, 'UNIDAD', :unit_id, :quantity)"
                    );
                    $insert->execute([":item_id" => $itemId, ":unit_id" => $unitId, ":quantity" => $quantity]);
                }
                $connection->commit();
                respondJson(200, ["status" => "success", "mensaje" => "Transferencia realizada", "cantidad_transferida" => $quantity]);
            } catch (Throwable $error) {
                if ($connection->inTransaction()) $connection->rollBack();
                throw $error;
            }
        }

        if ($action !== "alta") {
            respondJson(400, ["status" => "error", "mensaje" => "Acción de inventario desconocida"]);
        }
        $name = trim((string)($data["nombre"] ?? ""));
        $unitOfMeasure = trim((string)($data["unidad_medida"] ?? ""));
        $category = strtoupper(trim((string)($data["categoria"] ?? "")));
        $minimum = filter_var($data["stock_minimo"] ?? 0, FILTER_VALIDATE_INT);
        $quantity = filter_var($data["cantidad"] ?? null, FILTER_VALIDATE_INT);
        $location = trim((string)($data["ubicacion"] ?? ""));
        if ($name === "" || $unitOfMeasure === "" || $minimum === false || $minimum < 0 || $quantity === false || $quantity < 0 || $location === "") {
            respondJson(400, ["status" => "error", "mensaje" => "Completa los datos del insumo y su ubicación inicial"]);
        }
        $categoryMap = [
            "PREHOSPITALARIO" => "PREHOSPITALARIO",
            "LIMPIEZA" => "LIMPIEZA",
            "RESCATE" => "RESCATE_ACUATICO",
            "RESCATE_ACUATICO" => "RESCATE_ACUATICO",
            "CONTRA-INCENDIOS" => "CONTRA_INCENDIOS",
            "CONTRA_INCENDIOS" => "CONTRA_INCENDIOS",
            "COMBUSTIBLES" => "COMBUSTIBLES",
        ];
        if (!isset($categoryMap[$category])) {
            respondJson(400, ["status" => "error", "mensaje" => "Selecciona una categoría válida"]);
        }
        $categoryQuery = $connection->prepare("SELECT id_categoria FROM categorias_insumo WHERE nombre_categoria = :category LIMIT 1");
        $categoryQuery->execute([":category" => $categoryMap[$category]]);
        $categoryId = $categoryQuery->fetchColumn();
        if (!$categoryId) {
            respondJson(400, ["status" => "error", "mensaje" => "La categoría no existe en el catálogo"]);
        }
        if ($location === "BODEGA") {
            $locationType = "BODEGA";
            $locationId = $associationId;
        } else {
            $unitQuery = $connection->prepare(
                "SELECT id_unidades FROM unidades WHERE id_asociacion = :association_id AND nombre_unidad = :unit_name LIMIT 1"
            );
            $unitQuery->execute([":association_id" => $associationId, ":unit_name" => $location]);
            $locationId = $unitQuery->fetchColumn();
            if (!$locationId && in_array($location, $allowedUnits, true)) {
                $createUnit = $connection->prepare(
                    "INSERT INTO unidades (id_asociacion, nombre_unidad) VALUES (:association_id, :unit_name)"
                );
                $createUnit->execute([":association_id" => $associationId, ":unit_name" => $location]);
                $locationId = (int)$connection->lastInsertId();
            }
            if (!$locationId) {
                respondJson(400, ["status" => "error", "mensaje" => "La ubicación seleccionada no es válida"]);
            }
            $locationType = "UNIDAD";
        }
        $connection->beginTransaction();
        try {
            $insertItem = $connection->prepare(
                "INSERT INTO insumos (id_categoria, nombre, unidad_medida, stock_minimo, requiere_receta)
                 VALUES (:category_id, :name, :unit, :minimum, 0)"
            );
            $insertItem->execute([
                ":category_id" => $categoryId,
                ":name" => mb_substr($name, 0, 100),
                ":unit" => mb_substr($unitOfMeasure, 0, 50),
                ":minimum" => $minimum,
            ]);
            $itemId = (int)$connection->lastInsertId();
            $insertStock = $connection->prepare(
                "INSERT INTO inventario_ubicacion (id_insumo, tipo_ubicacion, id_referencia_lugar, cantidad_disponible)
                 VALUES (:item_id, :location_type, :location_id, :quantity)"
            );
            $insertStock->execute([
                ":item_id" => $itemId,
                ":location_type" => $locationType,
                ":location_id" => $locationId,
                ":quantity" => $quantity,
            ]);
            $connection->commit();
            respondJson(201, ["status" => "success", "mensaje" => "Insumo agregado al inventario", "id_insumo" => $itemId]);
        } catch (Throwable $error) {
            if ($connection->inTransaction()) $connection->rollBack();
            throw $error;
        }
    }

    if ($method !== "GET") {
        respondJson(405, ["status" => "error", "mensaje" => "Método no permitido"]);
    }
    if (!userCanAccess($connection, $user, "almacen_ver") && !userCanAccess($connection, $user, "campo_ver") && !userCanAccess($connection, $user, "campo_modificar")) {
        requireUserPermission($connection, $user, "almacen_ver");
    }

    $unitsQuery = $connection->prepare(
        "SELECT id_unidades, nombre_unidad FROM unidades WHERE id_asociacion = :association_id ORDER BY nombre_unidad"
    );
    $unitsQuery->execute([":association_id" => $user["id_asociacion"]]);
    $units = $unitsQuery->fetchAll();
    $location = trim((string)($_GET["ubicacion"] ?? ""));
    $unitName = trim((string)($_GET["unidad"] ?? ""));
    if ($location === "" && $unitName !== "") $location = $unitName;

    if ($location === "" || strtoupper($location) === "BODEGA") {
        $locationType = "BODEGA";
        $locationId = (int)$user["id_asociacion"];
    } else {
        $unitQuery = $connection->prepare(
            "SELECT id_unidades FROM unidades WHERE id_asociacion = :association_id AND nombre_unidad = :unit_name LIMIT 1"
        );
        $unitQuery->execute([":association_id" => $user["id_asociacion"], ":unit_name" => $location]);
        $locationId = $unitQuery->fetchColumn();
        if (!$locationId) {
            respondJson(200, ["status" => "success", "insumos" => [], "unidades" => $units]);
        }
        $locationType = "UNIDAD";
    }
    $locationPredicate = $locationType === "BODEGA"
        ? "UPPER(iu.tipo_ubicacion) = 'BODEGA'"
        : "UPPER(iu.tipo_ubicacion) IN ('UNIDAD', 'AMBULANCIA', 'BOTIQUIN')";
    $statement = $connection->prepare(
        "SELECT i.id_insumo, i.nombre, i.unidad_medida, i.stock_minimo,
                c.nombre_categoria AS categoria, SUM(iu.cantidad_disponible) AS cantidad_disponible
         FROM inventario_ubicacion iu
         INNER JOIN insumos i ON i.id_insumo = iu.id_insumo
         INNER JOIN categorias_insumo c ON c.id_categoria = i.id_categoria
                 WHERE iu.id_referencia_lugar = :location_id
           AND {$locationPredicate}
         GROUP BY i.id_insumo, i.nombre, i.unidad_medida, i.stock_minimo, c.nombre_categoria
         ORDER BY i.nombre"
    );
    $statement->execute([":location_id" => $locationId]);
    respondJson(200, ["status" => "success", "insumos" => $statement->fetchAll(), "unidades" => $units, "ubicacion" => $locationType === "BODEGA" ? "BODEGA" : $location]);
} catch (Throwable $error) {
    error_log("Error en inventario.php: " . $error->getMessage());
    respondJson(500, ["status" => "error", "mensaje" => "No se pudo consultar el inventario"]);
}
