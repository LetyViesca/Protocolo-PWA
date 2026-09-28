<?php
namespace Models;

use Config\Database;
use PDO;

class Asociacion {
    private $conn;

    public function __construct() {
        $this->conn = Database::getConnection();
    }

    public function registrar($data) {
        $codigo = "SCE-" . strtoupper(substr(md5(uniqid()), 0, 6));

        $stmt = $this->conn->prepare("INSERT INTO asociaciones 
            (nombre_asociacion, razon_social_se, rfc_cedula_fiscal, anio_ejercicio_fiscal, tipo_institucion, estado, ciudad, codigo_invitacion) 
            VALUES (:asoc, :razon, :rfc, :anio, :tipo, 'Coahuila', 'San Pedro', :codigo)");

        $stmt->execute([
            ':asoc'  => $data['asociacion'] ?? 'Sin Nombre',
            ':razon' => $data['razonSocial'] ?? '',
            ':rfc'   => $data['cedula'] ?? '',
            ':anio'  => $data['ejercicioFiscal'] ?? 2026,
            ':tipo'  => strtoupper($data['tipoInstitucion'] ?? 'GUBERNAMENTAL'),
            ':codigo' => $codigo
        ]);

        $idAsoc = $this->conn->lastInsertId();

        // Registrar Director
        $stmtUsr = $this->conn->prepare("INSERT INTO Usuario 
            (id_asociacion, id_rol, nombre, apellido_paterno, apellido_materno, correo, contrasena_hash, estatus_aprobado) 
            VALUES (:id_asoc, 5, :nombre, :paterno, :materno, :correo, :pass, 'APROBADO')");

        $stmtUsr->execute([
            ':id_asoc' => $idAsoc,
            ':nombre'  => $data['directorNombre'] ?? '',
            ':paterno' => $data['directorApPat'] ?? '',
            ':materno' => $data['directorApMat'] ?? '',
            ':correo'  => $data['directorEmail'] ?? '',
            ':pass'    => password_hash('123456', PASSWORD_BCRYPT)
        ]);

        return [
            "status" => "success",
            "codigo_invitacion" => $codigo,
            "id_asociacion" => $idAsoc
        ];
    }
}
?>