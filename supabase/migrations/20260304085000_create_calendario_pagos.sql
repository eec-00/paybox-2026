CREATE TABLE public.calendario_pagos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fecha DATE NOT NULL,
    nombre_pago TEXT NOT NULL,
    monto NUMERIC NOT NULL,
    moneda TEXT NOT NULL CHECK (moneda IN ('soles', 'dolares')),
    numero_factura TEXT,
    descripcion TEXT,
    estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'pagado')),
    registro_id UUID REFERENCES public.registros(id) ON DELETE SET NULL,
    creado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS policies
ALTER TABLE public.calendario_pagos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuarios autenticados pueden ver calendario_pagos" 
    ON public.calendario_pagos FOR SELECT 
    USING (auth.role() = 'authenticated');

CREATE POLICY "Usuarios autenticados pueden insertar en calendario_pagos" 
    ON public.calendario_pagos FOR INSERT 
    WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Usuarios autenticados pueden actualizar calendario_pagos" 
    ON public.calendario_pagos FOR UPDATE 
    USING (auth.role() = 'authenticated');

CREATE POLICY "Usuarios autenticados pueden eliminar calendario_pagos" 
    ON public.calendario_pagos FOR DELETE 
    USING (auth.role() = 'authenticated');
