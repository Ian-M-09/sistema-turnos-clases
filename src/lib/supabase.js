import { createClient } from "@supabase/supabase-js";
// "import" trae código de otra librería para poder usarlo acá.
// createClient es la función de Supabase que arma la conexión.

export const supabase = createClient(
    // "export" permite importar esta constante desde otros archivos.
    // "const" declara una variable que no se reasigna después.
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    // process.env es el objeto donde Next.js deja las variables que
    // cargaste en .env.local. Acá leemos la dirección del proyecto.
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    // Y acá leemos la clave pública.
);
// Con esto queda armada la conexión. Cualquier archivo que la necesite
// hace: import { supabase } from "@/lib/supabase";