-- =====================================================================
-- 005: tabla configuracion (datos que la profesora puede cambiar)
-- Guarda el depósito por hora y los datos de la cuenta para transferir.
-- La función "crear reserva" (A2) lee el precio de acá para calcular el
-- monto, y la pantalla del comprobante también lo lee de acá, así el
-- valor está en un solo lugar.
-- =====================================================================

create table configuracion (
  -- La tabla tiene UNA sola fila. El truco: el id es siempre 1
  -- (default 1) y el CHECK no deja cargar otro valor; como además es
  -- PRIMARY KEY (no se repite), nunca puede haber una segunda fila.
  id integer primary key default 1 check (id = 1),

  -- Depósito por hora (el 50%). Una media hora paga la mitad.
  deposito_por_hora numeric(10, 2) not null check (deposito_por_hora > 0),

  -- Datos para la transferencia que se muestran en el paso del comprobante.
  cbu text not null,
  alias text not null,
  titular text not null
);

-- INSERT INTO tabla (columnas) VALUES (valores): agrega una fila.
-- No se manda el id: toma el default 1. Son valores INVENTADOS a propósito:
-- los datos reales de la cuenta no se suben al repo. Después de correr el
-- script, cargar los reales en Supabase (Table Editor o un UPDATE).
insert into configuracion (deposito_por_hora, cbu, alias, titular)
values (15000, '0000000000000000000000', 'alias.de.prueba', 'Nombre de Prueba');

alter table configuracion enable row level security;

-- La pantalla del comprobante la lee con la clave anon, así que necesita
-- permiso de lectura (igual que disponibilidad en 003). Solo lectura:
-- el navegador no puede cambiar el precio.
create policy "Lectura pública de configuracion"
  on configuracion
  for select
  to anon
  using (true);
