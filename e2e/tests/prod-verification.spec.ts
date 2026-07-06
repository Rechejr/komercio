import { test, Page } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const BASE = 'https://ventrix.lat';
const EMAIL = 'admin@komercio.app';
const PASS = 'Admin123!';
const SHOTS = path.join(__dirname, '..', 'test-results', 'prod-shots');

async function login(page: Page) {
  await page.goto(`${BASE}/login`);
  await page.waitForLoadState('networkidle');
  await page.locator('input[type="email"]').fill(EMAIL);
  await page.locator('input[type="password"]').fill(PASS);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/dashboard|pos|configuracion|proveedores/, { timeout: 20000 });
}

async function shot(page: Page, name: string) {
  if (!fs.existsSync(SHOTS)) fs.mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: false });
  console.log(`    📸 ${name}.png`);
}

test('PROD-1: Proveedores — modal layout (Nombre comercial visible)', async ({ page }) => {
  test.setTimeout(60000);
  await login(page);

  await page.goto(`${BASE}/proveedores`);
  await page.waitForLoadState('networkidle');

  await page.locator('button', { hasText: /nuevo proveedor/i }).first().click();
  await page.waitForTimeout(800);

  // El primer label visible debe ser "Nombre comercial"
  const labels = await page.locator('form label').allTextContents();
  console.log('  Labels en DOM:', labels);
  console.log('  ¿Primer label es "Nombre comercial *"?', labels[0]?.trim() === 'Nombre comercial *');

  // Verificar que el header "Nuevo proveedor" es visible
  const header = page.locator('h2:has-text("Nuevo proveedor"), h2:has-text("Editar proveedor")').first();
  const headerVisible = await header.isVisible().catch(() => false);
  console.log('  ¿Header "Nuevo proveedor" visible?', headerVisible);

  await shot(page, 'v3-1a-modal-inicial');

  // Guardar con datos mínimos
  const nameInput = page.locator('input[name="name"]').first();
  await nameInput.scrollIntoViewIfNeeded();
  await nameInput.fill('Prov Test v3');
  await page.locator('button[type="submit"]').click();
  await page.waitForTimeout(2500);
  await shot(page, 'v3-1b-resultado-save');

  const hasError = await page.locator('text=/error al procesar/i').first().isVisible().catch(() => false);
  const hasSuccess = await page.locator('text=/proveedor.*creado|creado.*éxito/i').first().isVisible().catch(() => false);
  console.log('  ❌ Error al guardar:', hasError);
  console.log('  ✅ Guardado con éxito:', hasSuccess);
});

test('PROD-2: POS — agregar producto y cobrar', async ({ page }) => {
  test.setTimeout(90000);
  await login(page);

  await page.goto(`${BASE}/pos`);
  await page.waitForLoadState('networkidle');
  await shot(page, 'v3-2a-pos');

  // Buscar producto
  const search = page.locator('input[placeholder*="buscar" i], input[placeholder*="Buscar" i]').first();
  await search.waitFor({ timeout: 10000 });
  await search.fill('cafe');
  await page.waitForTimeout(1500);
  await shot(page, 'v3-2b-busqueda');

  // Los productos son <button type="button"> dentro de un .grid
  // Buscar el primer botón de producto en la grilla (no el botón Cobrar ni de la barra superior)
  const productGrid = page.locator('.grid').first();
  let productAdded = false;

  if (await productGrid.isVisible({ timeout: 5000 }).catch(() => false)) {
    const productBtns = productGrid.locator('button[type="button"]');
    const count = await productBtns.count();
    console.log(`  Productos visibles en grid: ${count}`);
    if (count > 0) {
      await productBtns.first().click();
      await page.waitForTimeout(800);
      productAdded = true;
      console.log('  Clicked primer botón de producto');
    }
  }

  if (!productAdded) {
    // Fallback: buscar con 'a' si 'cafe' no mostró nada
    await search.clear();
    await search.fill('a');
    await page.waitForTimeout(1500);
    const fallbackBtns = page.locator('.grid button[type="button"]');
    const fc = await fallbackBtns.count().catch(() => 0);
    if (fc > 0) {
      await fallbackBtns.first().click();
      await page.waitForTimeout(800);
      console.log('  Clicked producto (fallback búsqueda "a")');
    }
  }

  await page.waitForTimeout(800);
  await shot(page, 'v3-2c-carrito');

  // Verificar carrito no vacío
  const cartTotal = await page.locator('[class*="Total"], text=/Total/i').first().textContent().catch(() => '');
  console.log('  Cart total text:', cartTotal?.trim().slice(0, 50));

  // Intentar cobrar
  const cobrarBtn = page.locator('button:has-text("Cobrar"), button:has-text("cobrar")').first();
  const cobrarVisible = await cobrarBtn.isVisible({ timeout: 5000 }).catch(() => false);
  console.log('  Botón Cobrar visible:', cobrarVisible);

  if (cobrarVisible) {
    await cobrarBtn.click();
    await page.waitForTimeout(1500);
    await shot(page, 'v3-2d-cobrar-modal');

    // Si abrió modal de cobro, confirmar
    const confirmarBtn = page.locator('button:has-text("Confirmar"), button:has-text("Procesar"), button:has-text("Registrar venta")').first();
    if (await confirmarBtn.isVisible({ timeout: 4000 }).catch(() => false)) {
      await confirmarBtn.click();
      await page.waitForTimeout(2500);
      await shot(page, 'v3-2e-resultado-venta');
    }

    const hasError = await page.locator('[class*="toast"] text=/error|no se pudo/i, [class*="alert"] text=/error/i').first().isVisible().catch(() => false);
    const hasSuccess = await page.locator('text=/venta registrada|registrada con éxito|factura generada/i').first().isVisible().catch(() => false);
    // También verificar si el carrito se limpió (indica venta exitosa)
    const cartCleared = await page.locator('text=/Busca y agrega productos/i').first().isVisible().catch(() => false);
    console.log('  ❌ Error en venta:', hasError);
    console.log('  ✅ Venta exitosa (toast):', hasSuccess);
    console.log('  ✅ Carrito vaciado (indica éxito):', cartCleared);
  }
});

test('PROD-3: Gastos — crear gasto con destinatario', async ({ page }) => {
  test.setTimeout(60000);
  await login(page);

  await page.goto(`${BASE}/gastos`);
  await page.waitForLoadState('networkidle');

  const btn = page.locator('button:has-text("Registrar gasto"), button:has-text("Nuevo gasto")').first();
  await btn.waitFor({ timeout: 8000 });
  await btn.click();
  await page.waitForTimeout(800);
  await shot(page, 'v3-3a-modal-inicial');

  const labels = await page.locator('form label').allTextContents();
  console.log('  Labels form:', labels.slice(0, 4));
  const headerText = await page.locator('h2').first().textContent().catch(() => '?');
  console.log('  Header modal:', headerText);

  // Scroll al inicio del form y llenar descripción
  const descInput = page.locator('input[name="description"]').first();
  await descInput.scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(300);
  await descInput.fill('Gasto PW v3');
  await page.waitForTimeout(200);

  // Verificar que se llenó
  const descVal = await descInput.inputValue().catch(() => '');
  console.log('  Descripción llenada:', descVal);

  // Monto — buscar el PriceInput (type="text", inputMode="numeric")
  const amountInput = page.locator('input[inputmode="numeric"], input[placeholder="0"]').first();
  await amountInput.scrollIntoViewIfNeeded().catch(() => {});
  await amountInput.fill('15000');
  await page.waitForTimeout(300);

  // Destinatario
  const recipientInput = page.locator('input[name="recipientName"]').first();
  await recipientInput.scrollIntoViewIfNeeded().catch(() => {});
  await recipientInput.fill('Test Playwright v3');

  await shot(page, 'v3-3b-form-lleno');

  await page.locator('button[type="submit"]').click();
  await page.waitForTimeout(2500);
  await shot(page, 'v3-3c-resultado');

  const hasError422 = await page.locator('text=/datos inválidos/i').first().isVisible().catch(() => false);
  const hasErrorGeneral = await page.locator('text=/error al procesar/i').first().isVisible().catch(() => false);
  const hasSuccess = await page.locator('text=/gasto.*registrado|registrado.*éxito/i').first().isVisible().catch(() => false);
  console.log('  ❌ Datos inválidos (422):', hasError422);
  console.log('  ❌ Error general:', hasErrorGeneral);
  console.log('  ✅ Guardado con éxito:', hasSuccess);
});

test('PROD-4: Compras — crear proveedor inline desde dropdown', async ({ page }) => {
  test.setTimeout(60000);
  await login(page);

  await page.goto(`${BASE}/compras`);
  await page.waitForLoadState('networkidle');

  const btn = page.locator('button:has-text("Registrar compra"), button:has-text("Nueva compra")').first();
  await btn.waitFor({ timeout: 8000 });
  await btn.click();
  await page.waitForTimeout(800);
  await shot(page, 'v3-4a-compras-form');

  // Buscar el campo de proveedor
  const supInput = page.locator('input[placeholder*="proveedor" i], input[placeholder*="Buscar proveedor" i], input[placeholder*="buscar" i]').first();
  const supVisible = await supInput.isVisible({ timeout: 5000 }).catch(() => false);
  console.log('  Input proveedor visible:', supVisible);

  if (supVisible) {
    await supInput.fill('ZZZNUEVO');
    await page.waitForTimeout(800);
    await shot(page, 'v3-4b-busqueda-proveedor');

    // Ver contenido del dropdown
    const dropdowns = await page.locator('[class*="absolute"][class*="z-"], [class*="dropdown"]').all();
    for (const dd of dropdowns) {
      const text = await dd.textContent().catch(() => '');
      if (text && text.length > 5) {
        console.log('  Dropdown contenido:', text.trim().slice(0, 150));
      }
    }

    // Buscar botón "Crear nuevo" o similar
    const createBtn = page.locator('button:has-text("Crear"), button:has-text("Nuevo"), [class*="create"]').first();
    const createVisible = await createBtn.isVisible({ timeout: 3000 }).catch(() => false);
    console.log('  Botón crear proveedor visible:', createVisible);
    if (createVisible) {
      await createBtn.click();
      await page.waitForTimeout(800);
      await shot(page, 'v3-4c-form-proveedor-inline');
    }
  }
});