# PayBox - Sistema de Gestión de Gastos

## 🆕 NUEVA FUNCIONALIDAD: Sistema OCR con Soporte para PDFs

✨ **Ahora puedes cargar y analizar automáticamente facturas y comprobantes en PDF e imágenes**

El sistema cuenta con análisis inteligente usando OpenAI GPT-4o que:
- 📄 Detecta automáticamente si es una **Factura Electrónica** o **Comprobante de Pago**
- 🔍 Extrae datos específicos según el tipo de documento
- ✅ Pre-llena formularios automáticamente
- 🔄 Convierte PDFs a imágenes de alta calidad

**📚 Documentación completa**: [OCR_DOCS_INDEX.md](OCR_DOCS_INDEX.md)

**🚀 Inicio rápido**:
- **Desarrolladores**: [IMPLEMENTATION_SUMMARY.md](IMPLEMENTATION_SUMMARY.md)
- **Usuarios**: [PDF_OCR_USAGE_GUIDE.md](PDF_OCR_USAGE_GUIDE.md)
- **Testers**: [TESTING_GUIDE.md](TESTING_GUIDE.md)

---

## 1. Resumen General de la Arquitectura

Hemos diseñado un sistema de gestión de gastos robusto en Supabase. Su principal fortaleza es que combina un formulario de ingreso de datos fijo (para el OCR) con un formulario dinámico que se adapta a la categoría del gasto.

Todo el sistema está protegido por un sistema de permisos basado en roles que opera a nivel de base de datos (RLS), asegurando que los usuarios solo puedan ver y hacer aquello para lo que tienen autorización.2. Arquitectura de la Base de DatosHemos creado 3 tablas principales que se relacionan entre sí:📥 Tabla 1: reglas_imputacionEs el "cerebro" de la lógica de negocio. Almacena las 8 reglas de tu Matriz de Imputación.Propósito: Define "Si X $\rightarrow$ Entonces Y". Cada categoría de gasto se enlazará a una de estas reglas.Columnas Clave:situacion: (Ej. "Gasto atribuible a una orden")centro_costo_destino: (Ej. "Servicio", "Unidad", "Área", "Conductor", "Proyecto" - Ya corregidos y unificados).regla: (Ej. "Exigir Código de Servicio antes de registrar el gasto").

🗂️ Tabla 2: categoriasEs el catálogo principal de tu aplicación. Contiene las 17 categorías que el usuario seleccionará.Propósito: Define qué campos de formulario mostrar para cada tipo de gasto.Columnas Clave:categoria_id_texto: (Ej. "COGS-ROAD-COMB")categoria_nombre: (Ej. "Combustible (diésel)")naturaleza, subgrupo, centro_costo_destino.ejes_obligatorios (tipo text[]): Esta es la columna mágica. Almacena un array (ej. {"Servicio", "Cliente", "Placa"}) que tu frontend usará para renderizar dinámicamente los campos del formulario.regla_id (tipo Foreign Key): Un enlace directo al id de la tabla reglas_imputacion. Así, al elegir "Peajes", el sistema sabe que debe aplicar la regla "Exigir Código de Servicio...".

🧾 Tabla 3: registrosEs la tabla de datos principal. Aquí es donde se guarda cada gasto registrado por los usuarios. Es una tabla híbrida.Propósito: Almacenar los datos de los comprobantes.Columnas Fijas (para OCR):fecha_pago, beneficiario, monto, metodo_pago, banco_cuenta.moneda (con una restricción CHECK que solo permite "soles" o "dolares").Columnas de Contexto y Enlace:categoria_id (tipo Foreign Key): Enlaza este registro a la categoría que el usuario seleccionó (ej. "Peajes").creado_por (tipo uuid): Enlaza el registro con el id del usuario en auth.users que lo creó. Esencial para los permisos.Columnas Dinámicas (la otra parte mágica):datos_dinamicos (tipo jsonb): Almacena los datos del formulario dinámico. Si un gasto requería "Placa" y "Servicio", aquí se guardará: {"Placa": "ABC-123", "Servicio": "SRV-456"}.comprobantes (tipo text[]): Almacena las rutas de las imágenes subidas a Supabase Storage. Por convención, comprobantes[0] (el primer elemento) es siempre la imagen principal para el OCR.3. Sistema de Autenticación y PermisosHemos implementado un sistema de roles granular usando la metadata de Supabase Auth.Almacenamiento de Permisos: Los permisos no se guardan en una tabla, sino en el campo app_metadata de cada usuario.Rol de Administrador:Definición: Un usuario con app_metadata que contiene: {"role": "admin"}.Poderes: Puede hacer todo. Nuestras reglas de seguridad están configuradas para que el "admin" siempre tenga acceso.Tareas: Es el único que puede crear otros usuarios (a través de una Edge Function) y asignarles permisos.Rol de Usuario (Checklist):Definición: Un usuario estándar (ej. "Contador") tendrá un app_metadata así:JSON{
  "permissions": {
    "can_create": true,
    "can_edit": true,
    "can_delete": false
  }
}
4. Seguridad a Nivel de Base de Datos (RLS)Para hacer cumplir los permisos, hemos activado Row Level Security (RLS) en la tabla registros. Esto significa que la base de datos filtra los datos automáticamente en cada petición.Funciones "Helper": Creamos dos funciones SQL en el esquema public para ayudar a RLS a leer la metadata del usuario:public.is_admin(): Devuelve true si el usuario es "admin".public.get_permission(permission_name): Devuelve true o false si el usuario tiene ese permiso en su "checklist" (ej. get_permission('can_create')).Políticas de Seguridad Activas en registros:SELECT (Leer): Cualquier usuario autenticado puede leer los registros.INSERT (Crear): Permitido solo si is_admin() es true O get_permission('can_create') es true.UPDATE (Editar): Permitido solo si is_admin() es true O (get_permission('can_edit') es true Y el usuario es el creador del registro, auth.uid() = creado_por).DELETE (Borrar): Permitido solo si is_admin() es true O (get_permission('can_delete') es true Y el usuario es el creador del registro).

Paleta de colores:

Azul oscuro (Navy): Es el color de la cara superior del cubo.

Hexadecimal aproximado: #3B4A6B

Naranja dorado (Ocre/Mostaza): Es el color de las dos caras laterales visibles.

Hexadecimal aproximado: #DDAA45

Blanco: Se utiliza para el contorno grueso del logo.

Hexadecimal: #FFFFFF

Negro: Es el color del fondo de la imagen.

Hexadecimal: #000000