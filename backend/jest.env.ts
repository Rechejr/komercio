// Variables que algunos módulos leen AL IMPORTARSE (no por petición), así que
// deben existir antes de que Jest cargue el código bajo prueba. Son valores de
// mentira: las llamadas reales a Wompi están mockeadas en cada test.
process.env.WOMPI_PRIVATE_KEY = process.env.WOMPI_PRIVATE_KEY || 'prv_test_llave_de_prueba';
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
