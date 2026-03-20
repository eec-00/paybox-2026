# Ocultamiento temporal de Servicio

## Que se oculto
- Se oculto el eje dinamico Servicio en los formularios de registro y edicion de pagos.
- Mientras este oculto, Servicio ya no se valida como campo obligatorio al guardar en el formulario de nuevo registro.

## Archivos modificados
- components/PaymentForm.tsx
- components/EditPaymentForm.tsx

## Como revertir
- En components/PaymentForm.tsx:
  - Quitar el helper isHiddenAxis o cambiarlo para que no oculte servicio.
  - Restaurar el render de ejes para usar selectedCategoria.ejes_obligatorios sin filtro.
  - Restaurar la validacion para revisar todos los ejes obligatorios sin excluir servicio.
- En components/EditPaymentForm.tsx:
  - Quitar el helper isHiddenAxis o cambiarlo para que no oculte servicio.
  - Restaurar el render de ejes para usar selectedCategoria.ejes_obligatorios sin filtro.
