ALTER TABLE public.calendario_pagos 
ADD COLUMN frecuencia TEXT NOT NULL DEFAULT 'unica' CHECK (frecuencia IN ('unica', 'semanal', 'quincenal', 'mensual', 'anual')),
ADD COLUMN monto_variable BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN fecha_limite DATE;
