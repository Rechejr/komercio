import type { Metadata } from 'next';
import Link from 'next/link';
import { LEGAL, LEGAL_READY, SUBPROCESSORS } from '@/lib/legal';
import { LegalTitle, Section, Bullets, Callout, DataTable, DraftNotice } from '@/components/legal/LegalDoc';

export const metadata: Metadata = {
  title: 'Política de Privacidad y Tratamiento de Datos',
  description:
    'Política de tratamiento de datos personales de Ventrix, conforme a la Ley 1581 de 2012 y el Decreto 1074 de 2015 de Colombia.',
  alternates: { canonical: `${LEGAL.domain}/privacidad` },
  robots: LEGAL_READY ? undefined : { index: false, follow: false },
};

export default function PrivacidadPage() {
  return (
    <article>
      <DraftNotice />
      <LegalTitle
        title="Política de Privacidad y Tratamiento de Datos Personales"
        updated={LEGAL.lastUpdated}
      />

      <Section n={1} title="Responsable del Tratamiento">
        <p>
          En cumplimiento de la Ley 1581 de 2012 y del Decreto 1074 de 2015, se informa que el
          responsable del tratamiento de los datos personales recolectados a través de{' '}
          {LEGAL.brand} es:
        </p>
        <DataTable
          headers={['Dato', 'Información']}
          rows={[
            ['Razón social', LEGAL.legalName],
            ['NIT / Cédula', LEGAL.taxId],
            ['Domicilio', `${LEGAL.address}, ${LEGAL.city}, ${LEGAL.country}`],
            ['Correo electrónico', LEGAL.privacyEmail],
            ['Teléfono', LEGAL.supportPhone],
            ['Sitio web', LEGAL.domain],
          ]}
        />
      </Section>

      <Section n={2} title="Alcance y aceptación">
        <p>
          Esta política aplica a toda la información personal tratada por {LEGAL.brand} en la
          prestación de su servicio de punto de venta y gestión de inventario. Al crear una cuenta
          y usar la plataforma, el usuario declara haber leído esta política y otorga su
          autorización previa, expresa e informada para el tratamiento de sus datos en los términos
          aquí descritos.
        </p>
      </Section>

      <Section n={3} title="Doble rol: cuándo somos Responsables y cuándo Encargados">
        <Callout>
          Este es el punto más importante de esta política y conviene leerlo con atención, porque
          define quién responde por cada tipo de dato.
        </Callout>
        <p>
          <strong>{LEGAL.brand} es Responsable</strong> de los datos personales del suscriptor: es
          decir, los datos de la persona o negocio que contrata el servicio (nombre, correo,
          teléfono, datos de facturación y de uso de la plataforma).
        </p>
        <p>
          <strong>{LEGAL.brand} es únicamente Encargado</strong> respecto de los datos que el
          suscriptor carga en la plataforma sobre sus propios clientes, proveedores y empleados
          (nombres, documentos de identidad, teléfonos, direcciones, historial de compras y saldos
          de crédito o fiado). Esa información pertenece al suscriptor, quien actúa como Responsable
          frente a esos titulares.
        </p>
        <p>
          En consecuencia, es obligación del suscriptor contar con la autorización de sus propios
          clientes para registrar sus datos, informarles sobre el tratamiento y atender las
          solicitudes que estos presenten. {LEGAL.brand} trata esos datos exclusivamente siguiendo
          las instrucciones del suscriptor y nunca los usa para finalidades propias, ni los vende,
          ni los cede a terceros con fines comerciales.
        </p>
      </Section>

      <Section n={4} title="Datos que recolectamos">
        <p>
          <strong>Datos de cuenta:</strong> nombre, correo electrónico, contraseña (almacenada
          siempre cifrada mediante algoritmos de hash, nunca en texto plano), nombre del negocio y
          teléfono de contacto.
        </p>
        <p>
          <strong>Datos operativos:</strong> la información que el suscriptor registra en la
          plataforma, como productos, ventas, compras, gastos, movimientos de caja, clientes,
          proveedores y créditos.
        </p>
        <p>
          <strong>Datos técnicos:</strong> dirección IP, tipo de navegador y dispositivo, fecha y
          hora de acceso, y registros de actividad y de errores, utilizados para seguridad,
          auditoría y diagnóstico.
        </p>
        <Callout>
          <strong>Datos de pago:</strong> {LEGAL.brand} <strong>no almacena</strong> números de
          tarjeta de crédito o débito, códigos de seguridad ni credenciales bancarias. Los pagos se
          procesan íntegramente a través de Wompi (Bancolombia), que opera bajo sus propios
          estándares de seguridad. Nosotros solo conservamos el identificador de la transacción, el
          monto, la fecha y el estado del pago.
        </Callout>
      </Section>

      <Section n={5} title="Finalidades del tratamiento">
        <p>Los datos personales recolectados se utilizan para las siguientes finalidades:</p>
        <Bullets
          items={[
            'Crear y administrar la cuenta del usuario y permitir el acceso a la plataforma.',
            'Prestar, mantener y mejorar las funcionalidades del servicio contratado.',
            'Procesar los pagos de la suscripción y gestionar la facturación correspondiente.',
            'Enviar comunicaciones transaccionales: confirmación de registro, recuperación de contraseña, avisos de vencimiento del plan y notificaciones de la operación del negocio.',
            'Generar reportes, estadísticas y resúmenes automatizados para el propio suscriptor.',
            'Prevenir fraudes, detectar usos indebidos y garantizar la seguridad de la plataforma.',
            'Atender consultas, reclamos y solicitudes de soporte técnico.',
            'Cumplir obligaciones legales, contables y tributarias aplicables en Colombia.',
          ]}
        />
        <p>
          No se utilizan los datos para publicidad de terceros ni se comercializan bases de datos
          bajo ninguna circunstancia.
        </p>
      </Section>

      <Section n={6} title="Derechos del Titular">
        <p>
          Conforme al artículo 8 de la Ley 1581 de 2012, el titular de los datos personales tiene
          derecho a:
        </p>
        <Bullets
          items={[
            'Conocer, actualizar y rectificar sus datos personales frente al Responsable o Encargado del tratamiento.',
            'Solicitar prueba de la autorización otorgada, salvo en los casos en que la ley exceptúa este requisito.',
            'Ser informado, previa solicitud, sobre el uso que se ha dado a sus datos personales.',
            'Presentar quejas ante la Superintendencia de Industria y Comercio por infracciones a la ley.',
            'Revocar la autorización y solicitar la supresión de sus datos, cuando no exista un deber legal o contractual que lo impida.',
            'Acceder de forma gratuita a sus datos personales que hayan sido objeto de tratamiento.',
          ]}
        />
      </Section>

      <Section n={7} title="Procedimiento para consultas y reclamos">
        <p>
          Toda consulta o reclamo debe dirigirse al correo <strong>{LEGAL.privacyEmail}</strong>,
          indicando el nombre completo del titular, el documento de identidad, una descripción
          clara de la solicitud y los datos de contacto para la respuesta.
        </p>
        <p>Los plazos legales de respuesta son los siguientes:</p>
        <DataTable
          headers={['Tipo de solicitud', 'Plazo máximo', 'Prórroga']}
          rows={[
            ['Consulta', '10 días hábiles', 'Hasta 5 días hábiles adicionales, informando el motivo'],
            ['Reclamo', '15 días hábiles', 'Hasta 8 días hábiles adicionales, informando el motivo'],
          ]}
        />
        <p>
          Si el reclamo se recibe incompleto, se solicitará al interesado que subsane las fallas
          dentro de los cinco (5) días siguientes. Transcurridos dos (2) meses sin que presente la
          información requerida, se entenderá que ha desistido de la solicitud.
        </p>
        <p>
          Cuando la solicitud se refiera a datos de clientes registrados por un suscriptor,{' '}
          {LEGAL.brand} trasladará la petición al suscriptor correspondiente, por ser este el
          Responsable de dicha información, según lo explicado en la sección 3.
        </p>
      </Section>

      <Section n={8} title="Transmisión de datos a terceros">
        <p>
          Para operar la plataforma se utilizan proveedores de infraestructura y servicios que
          pueden procesar datos por cuenta de {LEGAL.brand}. Algunos de ellos se encuentran fuera de
          Colombia, por lo que el uso del servicio implica la autorización para la transferencia
          internacional de datos hacia dichos proveedores, quienes están obligados contractualmente
          a mantener niveles adecuados de protección.
        </p>
        <DataTable
          headers={['Proveedor', 'Finalidad', 'Ubicación']}
          rows={SUBPROCESSORS.map((s) => [s.name, s.purpose, s.location])}
        />
      </Section>

      <Section n={9} title="Medidas de seguridad">
        <p>
          {LEGAL.brand} adopta medidas técnicas, humanas y administrativas razonables para proteger
          la información contra acceso no autorizado, pérdida, alteración o uso indebido. Entre
          ellas: cifrado del tráfico mediante HTTPS, almacenamiento de contraseñas con algoritmos de
          hash, autenticación mediante tokens con expiración, control de acceso por roles,
          limitación de intentos de acceso, aislamiento de la información entre negocios distintos y
          registros de auditoría de las operaciones sensibles.
        </p>
        <p>
          Ningún sistema es completamente infalible. En caso de presentarse un incidente de
          seguridad que comprometa datos personales, se notificará a los titulares afectados y a la
          Superintendencia de Industria y Comercio conforme a la normatividad vigente.
        </p>
      </Section>

      <Section n={10} title="Conservación de los datos">
        <p>
          Los datos se conservan mientras la cuenta permanezca activa y durante el tiempo adicional
          necesario para cumplir obligaciones legales, contables y tributarias. Tras la cancelación
          de la cuenta, la información operativa se conserva por un periodo razonable que permite al
          suscriptor solicitar su exportación, y luego es eliminada o anonimizada, salvo aquella que
          deba conservarse por mandato legal.
        </p>
      </Section>

      <Section n={11} title="Datos de menores de edad">
        <p>
          El servicio está dirigido exclusivamente a personas mayores de edad con capacidad legal
          para contratar. {LEGAL.brand} no recolecta de forma consciente datos de menores de edad
          como titulares de una cuenta. Si se detecta que se ha registrado información de un menor
          sin la autorización correspondiente, se procederá a su supresión.
        </p>
      </Section>

      <Section n={12} title="Cookies y tecnologías similares">
        <p>
          La plataforma utiliza cookies y almacenamiento local del navegador estrictamente
          necesarios para el funcionamiento del servicio: mantener la sesión iniciada, recordar
          preferencias como el tema visual y la sucursal seleccionada, y proteger la seguridad de la
          cuenta. No se utilizan cookies de publicidad ni de seguimiento de terceros con fines
          comerciales. El usuario puede eliminar las cookies desde la configuración de su navegador,
          teniendo en cuenta que hacerlo cerrará su sesión.
        </p>
      </Section>

      <Section n={13} title="Vigencia y cambios">
        <p>
          Esta política rige a partir del {LEGAL.lastUpdated} y permanecerá vigente mientras{' '}
          {LEGAL.brand} preste sus servicios. Cualquier modificación sustancial será comunicada a
          través de la plataforma o por correo electrónico con antelación razonable a su entrada en
          vigor. Las bases de datos se conservarán durante el término de la relación comercial y los
          plazos legales aplicables.
        </p>
        <p className="pt-2">
          Consulta también nuestros{' '}
          <Link href="/terminos" className="text-emerald-600 dark:text-emerald-400 font-medium hover:underline">
            Términos y Condiciones
          </Link>
          .
        </p>
      </Section>
    </article>
  );
}
