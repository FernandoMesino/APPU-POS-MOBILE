import { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  useWindowDimensions,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";

/**
 * Teclado dibujado por la app.
 *
 * Existe por la pistola lectora: se empareja como teclado físico HID, y cuando
 * Android detecta un teclado físico oculta el teclado en pantalla. Este lo
 * reemplaza con botones propios, así el cajero siempre puede escribir sin
 * depender de ajustes del sistema ni de desconectar la pistola.
 *
 * Como escribe directo al estado (no al TextInput enfocado), la pistola puede
 * seguir capturando códigos mientras se teclea.
 *
 * Los campos que lo usan van con `showSoftInputOnFocus={false}`.
 */

type Props = {
  mode: "numeric" | "text";
  value: string;
  onChange: (next: string) => void;
  onClose: () => void;
  /** Etiqueta del campo que se está editando, para no perder el contexto. */
  label?: string;
  maxLength?: number;
  /** "oscuro" para pantallas de fondo oscuro, como el login. */
  variant?: "claro" | "oscuro";
};

/** off = minúsculas · una = solo la próxima letra · fija = bloqueo de mayúsculas */
type EstadoMayus = "off" | "una" | "fija";

const FILA_DIGITOS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];
const FILAS_TEXTO = [
  ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
  ["a", "s", "d", "f", "g", "h", "j", "k", "l", "ñ"],
  ["z", "x", "c", "v", "b", "n", "m"],
];
const SIMBOLOS = ["@", ".", "-", "_"];

// ─── Paleta ──────────────────────────────────────────────────────────────────

type Paleta = {
  fondo: string;
  tecla: string;
  teclaPulsada: string;
  modificador: string;
  modificadorPulsado: string;
  texto: string;
  textoTenue: string;
  acento: string;
  borde: string;
};

const CLARO: Paleta = {
  fondo: "#e6e8ef",
  tecla: "#ffffff",
  teclaPulsada: "#d7dae4",
  modificador: "#c3c7d4",
  modificadorPulsado: "#aeb3c4",
  texto: "#1f2937",
  textoTenue: "#6b7280",
  acento: "#2f2c59",
  borde: "#cdd1dd",
};

// Para pantallas de fondo oscuro (el login). Un teclado claro ahí corta la
// pantalla en dos y se ve pegado.
const OSCURO: Paleta = {
  fondo: "#232246",
  tecla: "#3a3866",
  teclaPulsada: "#2b2a52",
  modificador: "#1c1b3a",
  modificadorPulsado: "#15142c",
  texto: "#ffffff",
  textoTenue: "#a9a7c9",
  acento: "#ff6600",
  borde: "#3f3d6b",
};

export default function InAppKeyboard({
  mode,
  value,
  onChange,
  onClose,
  label,
  maxLength,
  variant = "claro",
}: Props) {
  const [mayus, setMayus] = useState<EstadoMayus>("una");
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const C = variant === "oscuro" ? OSCURO : CLARO;

  // ── Métrica responsive ──────────────────────────────────────────────────
  // El teclado se dimensiona contra la pantalla, no con valores fijos: en
  // apaisado hay poco alto y muchas filas, y en teléfonos angostos las teclas
  // de letras necesitan menos separación para que entren las 10 por fila.
  const apaisado = width > height;
  const angosto = width < 360;

  // En apaisado hay muy poco alto para 5 filas: con la proporción de vertical
  // el teclado tapaba el 63% de la pantalla. Ahí se usan teclas más bajas (que
  // se compensan con el ancho extra) y una barra superior compacta.
  // Hoy la app está bloqueada en vertical (app.json), así que esta rama solo
  // actúa como red de seguridad si eso cambia o en una tablet.
  const altoBase = height * (apaisado ? 0.07 : 0.056);
  const altoTecla = Math.round(clamp(altoBase, apaisado ? 24 : 34, 54));
  // El pad numérico tiene 4 filas en vez de 5 y teclas de dedo: puede ser más alto.
  const altoTeclaNum = Math.round(
    clamp(altoBase * 1.25, apaisado ? 32 : 44, 66)
  );

  const gap = apaisado ? 3 : angosto ? 2.5 : 4;
  const radio = angosto ? 7 : 9;

  const escribir = (ch: string) => {
    if (maxLength !== undefined && value.length >= maxLength) return;
    onChange(value + ch);
    // "una" se consume tras la primera letra; "fija" es bloqueo y no se toca.
    if (mode === "text" && mayus === "una") setMayus("off");
  };

  const borrar = () => onChange(value.slice(0, -1));

  // Ciclo del shift: off -> una -> fija -> off. El estado "fija" es el bloqueo
  // de mayúsculas, que antes no existía: la mayúscula se perdía tras cada letra.
  const cambiarMayus = () =>
    setMayus((m) => (m === "off" ? "una" : m === "una" ? "fija" : "off"));

  const metrica = { alto: mode === "numeric" ? altoTeclaNum : altoTecla, gap, radio, C };

  return (
    <View
      style={[
        styles.contenedor,
        {
          backgroundColor: C.fondo,
          borderTopColor: C.borde,
          paddingHorizontal: gap,
          // Respeta la barra de gestos: sin esto, la última fila queda debajo.
          paddingBottom: Math.max(insets.bottom, gap * 2),
        },
      ]}
    >
      {/* Barra superior: qué se edita + cerrar */}
      <View style={[styles.barra, apaisado && styles.barraCompacta]}>
        <View style={styles.etiquetaChip}>
          <Ionicons name="create-outline" size={13} color={C.textoTenue} />
          <Text
            style={[styles.etiquetaTexto, { color: C.textoTenue }]}
            numberOfLines={1}
          >
            {label ?? "Escribiendo"}
          </Text>
        </View>

        <TouchableOpacity
          onPress={onClose}
          activeOpacity={0.75}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={[styles.listo, { backgroundColor: C.acento }]}
        >
          <Text style={styles.listoTexto}>Listo</Text>
          <Ionicons name="chevron-down" size={15} color="#ffffff" />
        </TouchableOpacity>
      </View>

      {mode === "numeric" ? (
        <NumericPad m={metrica} onPress={escribir} onBorrar={borrar} />
      ) : (
        <TextPad
          m={metrica}
          mayus={mayus}
          onToggleMayus={cambiarMayus}
          onPress={escribir}
          onBorrar={borrar}
        />
      )}
    </View>
  );
}

function clamp(n: number, min: number, max: number) {
  return Math.min(Math.max(n, min), max);
}

type Metrica = { alto: number; gap: number; radio: number; C: Paleta };

// ─── Layout numérico ─────────────────────────────────────────────────────────

function NumericPad({
  m,
  onPress,
  onBorrar,
}: {
  m: Metrica;
  onPress: (ch: string) => void;
  onBorrar: () => void;
}) {
  const filas = [
    ["1", "2", "3"],
    ["4", "5", "6"],
    ["7", "8", "9"],
  ];

  return (
    <View>
      {filas.map((fila) => (
        <View key={fila[0]} style={styles.fila}>
          {fila.map((n) => (
            <Tecla key={n} m={m} label={n} onPress={() => onPress(n)} destacada />
          ))}
        </View>
      ))}
      <View style={styles.fila}>
        <Tecla m={m} label="00" onPress={() => onPress("00")} destacada />
        <Tecla m={m} label="0" onPress={() => onPress("0")} destacada />
        <Tecla m={m} icon="backspace-outline" onPress={onBorrar} modificador />
      </View>
    </View>
  );
}

// ─── Layout de texto ─────────────────────────────────────────────────────────

function TextPad({
  m,
  mayus,
  onToggleMayus,
  onPress,
  onBorrar,
}: {
  m: Metrica;
  mayus: EstadoMayus;
  onToggleMayus: () => void;
  onPress: (ch: string) => void;
  onBorrar: () => void;
}) {
  const enMayus = mayus !== "off";
  const letra = (l: string) => (enMayus ? l.toUpperCase() : l);

  return (
    <View>
      <View style={styles.fila}>
        {FILA_DIGITOS.map((d) => (
          <Tecla key={d} m={m} label={d} onPress={() => onPress(d)} tenue />
        ))}
      </View>

      {FILAS_TEXTO.slice(0, 2).map((fila, i) => (
        <View key={i} style={styles.fila}>
          {fila.map((l) => (
            <Tecla key={l} m={m} label={letra(l)} onPress={() => onPress(letra(l))} />
          ))}
        </View>
      ))}

      {/* Última fila de letras: shift y borrar la flanquean, más anchas. */}
      <View style={styles.fila}>
        {/* Un toque activa la mayúscula para la próxima letra; otro toque la
            deja fija (candado) hasta que se vuelva a tocar. */}
        <Tecla
          m={m}
          icon={
            mayus === "fija"
              ? "lock-closed"
              : mayus === "una"
              ? "arrow-up"
              : "arrow-up-outline"
          }
          onPress={onToggleMayus}
          modificador
          activa={enMayus}
          peso={1.5}
        />
        {FILAS_TEXTO[2].map((l) => (
          <Tecla key={l} m={m} label={letra(l)} onPress={() => onPress(letra(l))} />
        ))}
        <Tecla m={m} icon="backspace-outline" onPress={onBorrar} modificador peso={1.5} />
      </View>

      <View style={styles.fila}>
        {SIMBOLOS.map((s) => (
          <Tecla key={s} m={m} label={s} onPress={() => onPress(s)} tenue />
        ))}
        <Tecla m={m} label="espacio" onPress={() => onPress(" ")} peso={4} pequena />
      </View>
    </View>
  );
}

// ─── Tecla ───────────────────────────────────────────────────────────────────

function Tecla({
  m,
  label,
  icon,
  onPress,
  modificador,
  activa,
  tenue,
  destacada,
  pequena,
  peso = 1,
}: {
  m: Metrica;
  label?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  /** Teclas de función (shift, borrar): gris, para distinguirlas de las letras. */
  modificador?: boolean;
  activa?: boolean;
  /** Dígitos y símbolos en el layout de texto: menos peso visual que las letras. */
  tenue?: boolean;
  /** Pad numérico: número más grande. */
  destacada?: boolean;
  /** Etiquetas largas como "espacio". */
  pequena?: boolean;
  peso?: number;
}) {
  const C = m.C;
  const colorContenido = activa ? "#ffffff" : tenue ? C.textoTenue : C.texto;

  // El estado de pulsado se lleva a mano en vez de con `style` como función de
  // Pressable: NativeWind parchea los componentes del core para soportar
  // `className` y descarta esa forma funcional, con lo que la tecla se quedaba
  // sin ningún estilo.
  const [pulsada, setPulsada] = useState(false);

  return (
    <TouchableOpacity
      onPress={onPress}
      onPressIn={() => setPulsada(true)}
      onPressOut={() => setPulsada(false)}
      activeOpacity={1}
      style={[
        styles.tecla,
        // La sombra se apaga al pulsar: da la sensación de que se hunde.
        pulsada ? null : styles.teclaSombra,
        {
          height: m.alto,
          borderRadius: m.radio,
          margin: m.gap / 2,
          flexGrow: peso,
          flexBasis: 0,
          backgroundColor: activa
            ? C.acento
            : modificador
            ? pulsada
              ? C.modificadorPulsado
              : C.modificador
            : pulsada
            ? C.teclaPulsada
            : C.tecla,
        },
      ]}
    >
      {icon ? (
        <Ionicons name={icon} size={Math.round(m.alto * 0.42)} color={colorContenido} />
      ) : (
        <Text
          style={{
            color: colorContenido,
            textAlign: "center",
            fontSize: pequena
              ? Math.round(m.alto * 0.3)
              : destacada
              ? Math.round(m.alto * 0.44)
              : Math.round(m.alto * 0.4),
            fontWeight: destacada ? "600" : "500",
          }}
          numberOfLines={1}
        >
          {label}
        </Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  contenedor: {
    // Ancho explícito: si el padre alinea distinto de "stretch", el teclado se
    // encogía al contenido y las teclas se apilaban en una esquina.
    width: "100%",
    alignSelf: "stretch",
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 6,
    // Sombra hacia arriba: despega el teclado del contenido de la pantalla.
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: -3 },
        shadowOpacity: 0.12,
        shadowRadius: 8,
      },
      android: { elevation: 12 },
    }),
  },
  barra: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 6,
    paddingBottom: 8,
  },
  barraCompacta: {
    paddingBottom: 3,
  },
  etiquetaChip: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 1,
    gap: 5,
  },
  etiquetaTexto: {
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    flexShrink: 1,
  },
  listo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
  },
  listoPulsado: {
    opacity: 0.75,
  },
  listoTexto: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "700",
  },
  fila: {
    flexDirection: "row",
    alignSelf: "stretch",
  },
  tecla: {
    alignItems: "center",
    justifyContent: "center",
  },
  teclaSombra: {
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.18,
        shadowRadius: 1.5,
      },
      android: { elevation: 2 },
    }),
  },
});
