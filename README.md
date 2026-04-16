# PayBox - Sistema de Gestión de Gastos.

**🚀 Inicio rápido**:
- **Desarrolladores**: [IMPLEMENTATION_SUMMARY.md](IMPLEMENTATION_SUMMARY.md)
- **Usuarios**: [PDF_OCR_USAGE_GUIDE.md](PDF_OCR_USAGE_GUIDE.md)
- **Testers**: [TESTING_GUIDE.md](TESTING_GUIDE.md)

---

## 1. Resumen General de la Arquitectura

Hemos diseñado un sistema de gestión de gastos robusto en Supabase. Su principal fortaleza es que combina un formulario de ingreso de datos fijo (para el OCR) con un formulario dinámico que se adapta a la categoría del gasto.

Todo el sistema está protegido por un sistema de permisos basado en roles que opera a nivel de base de datos (RLS), asegurando que los usuarios solo puedan ver y hacer aquello para lo que tienen autorización.2. Arquitectura de la Base de DatosHemos creado 3 tablas principales que se relacionan entre sí:📥 Tabla 1: reglas_imputacionEs el "cerebro" de la lógica de negocio. Almacena las 8 reglas de tu Matriz de Imputación.Propósito: Define "Si X $\rightarrow$ Entonces Y". Cada categoría de gasto se enlazará a una de estas reglas.Columnas Clave:situacion: (Ej. "Gasto atribuible a una orden")centro_costo_destino: (Ej. "Servicio", "Unidad", "Área", "Conductor", "Proyecto" - Ya corregidos y unificados).regla: (Ej. "Exigir Código de Servicio antes de registrar el gasto").
