<?php
namespace Models;

use Config\Database;
use InvalidArgumentException;
use PDO;

class Asociacion {
    private $conn;

    public function __construct() {
        $this->conn = Database::getConnection();
    }

    public function registrar($data) {
        $associationName = trim((string)($data['asociacion'] ?? ''));
        $legalName = trim((string)($data['razonSocial'] ?? ''));
        $taxId = trim((string)($data['cedula'] ?? ''));
        $directorName = trim((string)($data['directorNombre'] ?? ''));
        $directorLastName = trim((string)($data['directorApPat'] ?? ''));
        $directorSecondLastName = trim((string)($data['directorApMat'] ?? ''));
        $directorEmail = trim((string)($data['directorEmail'] ?? ''));
        $password = is_string($data['contrasena'] ?? null) ? $data['contrasena'] : '';

        if (
            $associationName === '' || $legalName === '' || $taxId === ''
            || $directorName === '' || $directorLastName === ''
            || !filter_var($directorEmail, FILTER_VALIDATE_EMAIL) || $password === ''
        ) {
            throw new InvalidArgumentException('Completa los datos de la institución, del Director y su contraseña.');
        }
        if (
            mb_strlen($associationName) > 100 || mb_strlen($legalName) > 100 || mb_strlen($taxId) > 13
            || mb_strlen($directorName) > 50 || mb_strlen($directorLastName) > 50 || mb_strlen($directorSecondLastName) > 50
            || mb_strlen($directorEmail) > 100
        ) {
            throw new InvalidArgumentException('Uno o más campos superan la longitud permitida.');
        }

        $passwordHash = password_hash($password, PASSWORD_BCRYPT);
        if ($passwordHash === false) {
            throw new \RuntimeException('No se pudo proteger la contraseña.');
        }
        $codigo = 'SCE-' . strtoupper(bin2hex(random_bytes(3)));
        $year = filter_var($data['ejercicioFiscal'] ?? date('Y'), FILTER_VALIDATE_INT);
        if ($year === false || $year < 1900 || $year > 2200) {
            throw new InvalidArgumentException('El año fiscal no es válido.');
        }

        $this->conn->beginTransaction();
        try {
            $stmt = $this->conn->prepare("INSERT INTO asociaciones
                (nombre_asociacion, razon_social_se, rfc_cedula_fiscal, anio_ejercicio_fiscal, tipo_institucion, estado, ciudad, codigo_invitacion)
                VALUES (:asoc, :razon, :rfc, :anio, :tipo, 'Coahuila', 'San Pedro', :codigo)");
            $stmt->execute([
                ':asoc' => $associationName,
                ':razon' => $legalName,
                ':rfc' => $taxId,
                ':anio' => $year,
                ':tipo' => mb_substr(strtoupper(trim((string)($data['tipoInstitucion'] ?? 'GUBERNAMENTAL'))), 0, 50),
                ':codigo' => $codigo,
            ]);

            $associationId = (int)$this->conn->lastInsertId();
            $stmtUser = $this->conn->prepare("INSERT INTO Usuario
                (id_asociacion, id_rol, nombre, apellido_paterno, apellido_materno, correo, contrasena_hash, estatus_aprobado)
                VALUES (:association_id, 5, :name, :last_name, :second_last_name, :email, :password_hash, 'APROBADO')");
            $stmtUser->execute([
                ':association_id' => $associationId,
                ':name' => $directorName,
                ':last_name' => $directorLastName,
                ':second_last_name' => $directorSecondLastName,
                ':email' => $directorEmail,
                ':password_hash' => $passwordHash,
            ]);
            $this->conn->commit();

            return [
                'status' => 'success',
                'mensaje' => 'Institución y cuenta de Director registradas. Ya puedes iniciar sesión.',
                'codigo_invitacion' => $codigo,
                'id_asociacion' => $associationId,
                'id_usuario' => (int)$this->conn->lastInsertId(),
            ];
        } catch (\Throwable $error) {
            if ($this->conn->inTransaction()) $this->conn->rollBack();
            throw $error;
        }
    }
}
?>