import type { Metadata } from 'next';
import Link from 'next/link';
import { LEGAL } from '@/lib/legal';
import { LegalTitle, Section, Bullets, Callout } from '@/components/legal/LegalDoc';

export const metadata: Metadata = {
  title: 'Términos y Condiciones',
  description:
    'Términos y condiciones de uso del servicio Ventrix: planes, pagos, cancelación, responsabilidades y ley aplicable en Colombia.',
  alternates: { canonical: `${LEGAL.domain}/terminos` },
};

export default function TerminosPage() {
  return (
    <article>
      <LegalTitle title="Términos y Condiciones de Uso" updated={LEGAL.lastUpdated} />

      <Section n={1} title="Identificación del prestador">
        <p>
          {LEGAL.brand} es un servicio de software como servicio (SaaS) para punto de venta,
          control de inventario y gestión comercial, prestado por {LEGAL.legalName}, identificado
          con {LEGAL.taxId}, con domicilio en {LEGAL.address}, {LEGAL.city}, {LEGAL.country}, y
          correo electrónico {LEGAL.supportEmail}.
        </p>
      </Section>

      <Section n={2} title="Aceptación de los términos">
        <p>
          Al crear una cuenta o utilizar {LEGAL.brand}, el usuario acepta íntegramente estos
          términos y condiciones, así como la{' '}
          <Link href="/privacidad" className="text-emerald-600 dark:text-emerald-400 font-medium hover:underline">
            Política de Privacidad
          </Link>
          . Si no está de acuerdo con alguna de sus disposiciones, debe abstenerse de usar el
          servicio.
        </p>
        <p>
          El usuario declara ser mayor de edad y contar con capacidad legal para contratar, y que la
          información suministrada durante el registro es veraz, completa y actualizada.
        </p>
      </Section>

      <Section n={3} title="Descripción del servicio">
        <p>
          {LEGAL.brand} permite registrar ventas y compras, controlar inventario por bodegas,
          administrar clientes y proveedores, llevar créditos y fiados, manejar caja y gastos, y
          generar reportes. El servicio se presta a través de internet y requiere una conexión
          activa para funcionar.
        </p>
        <p>
          {LEGAL.brand} se reserva el derecho de modificar, agregar o retirar funcionalidades para
          mejorar el servicio. Cuando un cambio afecte de forma significativa las funciones
          contratadas en un plan pago, se informará al usuario con antelación razonable.
        </p>
      </Section>

      <Section n={4} title="Cuenta y credenciales">
        <p>
          El usuario es el único responsable de mantener la confidencialidad de su contraseña y de
          toda la actividad que ocurra bajo su cuenta. Debe notificar de inmediato cualquier uso no
          autorizado al correo {LEGAL.supportEmail}.
        </p>
        <p>
          Cuando el usuario cree cuentas adicionales para sus empleados, será responsable de asignar
          los permisos adecuados y de la actividad que estos realicen dentro de la plataforma.
        </p>
      </Section>

      <Section n={5} title="Planes, precios y pagos">
        <p>
          {LEGAL.brand} ofrece un plan gratuito con funcionalidades y límites reducidos, y un plan
          Pro de pago. Los precios vigentes se muestran dentro de la aplicación al momento de
          contratar y están expresados en pesos colombianos (COP).
        </p>
        <p>
          Los pagos se procesan a través de Wompi (Bancolombia). {LEGAL.brand} no almacena datos de
          tarjetas ni credenciales bancarias. El plan Pro se activa una vez confirmado el pago por
          la pasarela y tiene la vigencia correspondiente al periodo contratado: mensual, trimestral
          o anual.
        </p>
        <p>
          La suscripción <strong>no se renueva automáticamente</strong>: al finalizar el periodo
          contratado, la cuenta regresa al plan gratuito hasta que el usuario realice un nuevo pago.
          No se generan cobros sorpresa ni débitos recurrentes sin autorización.
        </p>
      </Section>

      <Section n={6} title="Cambios de precio y garantía de precio para clientes activos">
        <Callout>
          Si {LEGAL.brand} aumenta sus precios, los usuarios con una suscripción vigente conservan
          el precio que pagaron durante todo el periodo contratado. Ningún aumento se aplica de
          forma retroactiva.
        </Callout>
        <p>
          Los nuevos precios aplican únicamente a contrataciones o renovaciones posteriores a la
          fecha de entrada en vigor del cambio, la cual será comunicada con una antelación mínima de
          treinta (30) días calendario a través de la plataforma o por correo electrónico.
        </p>
      </Section>

      <Section n={7} title="Derecho de retracto y reembolsos">
        <p>
          De conformidad con el artículo 47 de la Ley 1480 de 2011 (Estatuto del Consumidor), en las
          ventas realizadas por medios electrónicos el consumidor puede ejercer el derecho de
          retracto dentro de los cinco (5) días hábiles siguientes a la contratación, solicitando la
          devolución del dinero pagado.
        </p>
        <p>
          Para ejercerlo, basta escribir a {LEGAL.supportEmail} desde el correo asociado a la
          cuenta. El reembolso se realizará por el mismo medio de pago dentro de los treinta (30)
          días calendario siguientes a la solicitud. Las comisiones cobradas por la pasarela de
          pagos podrán descontarse cuando así lo permita la normatividad aplicable.
        </p>
      </Section>

      <Section n={8} title="Uso aceptable">
        <p>El usuario se obliga a no utilizar la plataforma para:</p>
        <Bullets
          items={[
            'Actividades ilícitas o contrarias a la ley colombiana, incluyendo el registro de operaciones destinadas a evadir obligaciones tributarias.',
            'Almacenar datos personales sin contar con la autorización de sus titulares.',
            'Intentar acceder a cuentas, datos o áreas de la plataforma que no le correspondan.',
            'Realizar ingeniería inversa, copiar, revender o redistribuir el software.',
            'Ejecutar procesos automatizados que degraden el rendimiento del servicio o vulneren los límites de uso del plan contratado.',
            'Compartir una misma suscripción entre negocios distintos e independientes.',
          ]}
        />
      </Section>

      <Section n={9} title="Propiedad de la información del usuario">
        <p>
          Toda la información que el usuario registra en la plataforma (productos, ventas, clientes,
          proveedores y demás datos operativos) es de su exclusiva propiedad. {LEGAL.brand} no
          reclama derecho alguno sobre ella y la utiliza únicamente para prestar el servicio.
        </p>
        <p>
          El usuario con plan Pro puede exportar su información en formatos estándar en cualquier
          momento. Se recomienda hacerlo de forma periódica como respaldo propio.
        </p>
      </Section>

      <Section n={10} title="Propiedad intelectual de la plataforma">
        <p>
          El software, la marca {LEGAL.brand}, el diseño, los logotipos y el código fuente son
          propiedad de {LEGAL.legalName} y están protegidos por las normas de propiedad intelectual.
          El contrato otorga al usuario una licencia limitada, personal, revocable e intransferible
          de uso, que no implica cesión de derechos de ningún tipo.
        </p>
      </Section>

      <Section n={11} title="Disponibilidad del servicio">
        <p>
          {LEGAL.brand} realiza esfuerzos razonables para mantener el servicio disponible de forma
          continua, pero no garantiza una disponibilidad ininterrumpida. El servicio puede
          suspenderse temporalmente por mantenimiento programado, actualizaciones, fallas de
          proveedores de infraestructura o eventos de fuerza mayor.
        </p>
        <p>
          Cuando sea posible, los mantenimientos programados se anunciarán con antelación y se
          realizarán en horarios de baja actividad.
        </p>
      </Section>

      <Section n={12} title="Limitación de responsabilidad">
        <p>
          {LEGAL.brand} es una herramienta de apoyo a la gestión comercial. El usuario es el único
          responsable de la veracidad de la información que registra, de sus decisiones de negocio y
          del cumplimiento de sus obligaciones tributarias, contables y laborales.
        </p>
        <p>
          Los reportes, estadísticas y resúmenes generados de forma automatizada, incluidos los
          producidos mediante inteligencia artificial, tienen carácter meramente informativo y
          orientativo. No constituyen asesoría contable, tributaria, financiera ni legal, y no deben
          ser la única base para tomar decisiones. El usuario debe verificar dicha información antes
          de actuar sobre ella.
        </p>
        <p>
          En la máxima medida permitida por la ley, la responsabilidad total de {LEGAL.brand} frente
          al usuario por cualquier reclamación derivada del servicio no excederá el monto
          efectivamente pagado por este durante los tres (3) meses anteriores al hecho que originó
          la reclamación. Lo anterior no limita los derechos irrenunciables que la ley colombiana
          reconoce a los consumidores.
        </p>
      </Section>

      <Section n={13} title="Suspensión y terminación">
        <p>
          El usuario puede cancelar su cuenta en cualquier momento desde la configuración de la
          plataforma o solicitándolo a {LEGAL.supportEmail}.
        </p>
        <p>
          {LEGAL.brand} podrá suspender o cancelar una cuenta cuando se incumplan estos términos, se
          detecte actividad fraudulenta o se ponga en riesgo la seguridad de la plataforma o de
          otros usuarios. Salvo en casos graves que exijan acción inmediata, se notificará
          previamente al usuario y se le concederá un plazo razonable para subsanar la situación.
        </p>
      </Section>

      <Section n={14} title="Modificación de los términos">
        <p>
          Estos términos podrán actualizarse para reflejar cambios en el servicio o en la
          normatividad aplicable. Las modificaciones sustanciales se comunicarán a través de la
          plataforma o por correo electrónico. El uso continuado del servicio después de la entrada
          en vigor implica la aceptación de los nuevos términos.
        </p>
      </Section>

      <Section n={15} title="Ley aplicable y solución de controversias">
        <p>
          Estos términos se rigen por las leyes de la República de Colombia. Cualquier controversia
          se someterá a la jurisdicción de los jueces competentes de {LEGAL.city}, {LEGAL.country}.
        </p>
        <p>
          Antes de acudir a la vía judicial, las partes procurarán resolver sus diferencias de forma
          directa. El usuario también puede presentar sus reclamaciones ante la Superintendencia de
          Industria y Comercio, en su calidad de autoridad de protección al consumidor y de datos
          personales.
        </p>
      </Section>

      <Section n={16} title="Contacto">
        <p>
          Para cualquier duda sobre estos términos, escríbenos a{' '}
          <strong>{LEGAL.supportEmail}</strong> o al WhatsApp {LEGAL.supportPhone}.
        </p>
      </Section>
    </article>
  );
}
