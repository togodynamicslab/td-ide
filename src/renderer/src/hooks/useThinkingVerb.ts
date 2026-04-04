import { useState, useEffect, useRef, useCallback } from 'react'

const THINKING_VERBS = [
  'Accomplishing', 'Actioning', 'Actualizing', 'Architecting', 'Baking', 'Beaming',
  "Beboppin'", 'Befuddling', 'Billowing', 'Blanching', 'Bloviating', 'Boogieing',
  'Boondoggling', 'Booping', 'Bootstrapping', 'Brewing', 'Bunning', 'Burrowing',
  'Calculating', 'Canoodling', 'Caramelizing', 'Cascading', 'Catapulting', 'Cerebrating',
  'Channeling', 'Channelling', 'Choreographing', 'Churning', 'Clauding', 'Coalescing',
  'Cogitating', 'Combobulating', 'Composing', 'Computing', 'Concocting', 'Considering',
  'Contemplating', 'Cooking', 'Crafting', 'Creating', 'Crunching', 'Crystallizing',
  'Cultivating', 'Deciphering', 'Deliberating', 'Determining', 'Dilly-dallying',
  'Discombobulating', 'Doing', 'Doodling', 'Drizzling', 'Ebbing', 'Effecting',
  'Elucidating', 'Embellishing', 'Enchanting', 'Envisioning', 'Evaporating', 'Fermenting',
  'Fiddle-faddling', 'Finagling', 'Flambeing', 'Flibbertigibbeting', 'Flowing',
  'Flummoxing', 'Fluttering', 'Forging', 'Forming', 'Frolicking', 'Frosting',
  'Gallivanting', 'Galloping', 'Garnishing', 'Generating', 'Gesticulating', 'Germinating',
  'Gitifying', 'Grooving', 'Gusting', 'Harmonizing', 'Hashing', 'Hatching', 'Herding',
  'Honking', 'Hullaballooing', 'Hyperspacing', 'Ideating', 'Imagining', 'Improvising',
  'Incubating', 'Inferring', 'Infusing', 'Ionizing', 'Jitterbugging', 'Julienning',
  'Kneading', 'Leavening', 'Levitating', 'Lollygagging', 'Manifesting', 'Marinating',
  'Meandering', 'Metamorphosing', 'Misting', 'Moonwalking', 'Moseying', 'Mulling',
  'Mustering', 'Musing', 'Nebulizing', 'Nesting', 'Newspapering', 'Noodling',
  'Nucleating', 'Orbiting', 'Orchestrating', 'Osmosing', 'Perambulating', 'Percolating',
  'Perusing', 'Philosophising', 'Photosynthesizing', 'Pollinating', 'Pondering',
  'Pontificating', 'Pouncing', 'Precipitating', 'Prestidigitating', 'Processing',
  'Proofing', 'Propagating', 'Puttering', 'Puzzling', 'Quantumizing', 'Razzle-dazzling',
  'Razzmatazzing', 'Recombobulating', 'Reticulating', 'Roosting', 'Ruminating',
  'Sauteing', 'Scampering', 'Schlepping', 'Scurrying', 'Seasoning', 'Shenaniganing',
  'Shimmying', 'Simmering', 'Skedaddling', 'Sketching', 'Slithering', 'Smooshing',
  'Sock-hopping', 'Spelunking', 'Spinning', 'Sprouting', 'Stewing', 'Sublimating',
  'Swirling', 'Swooping', 'Symbioting', 'Synthesizing', 'Tempering', 'Thinking',
  'Thundering', 'Tinkering', 'Tomfoolering', 'Topsy-turvying', 'Transfiguring',
  'Transmuting', 'Twisting', 'Undulating', 'Unfurling', 'Unravelling', 'Vibing',
  'Waddling', 'Wandering', 'Warping', 'Whatchamacalliting', 'Whirlpooling', 'Whirring',
  'Whisking', 'Wibbling', 'Working', 'Wrangling', 'Zesting', 'Zigzagging',
]

function pickRandom(exclude?: string): string {
  let verb: string
  do {
    verb = THINKING_VERBS[Math.floor(Math.random() * THINKING_VERBS.length)]
  } while (verb === exclude && THINKING_VERBS.length > 1)
  return verb
}

const CHAR_INTERVAL = 50        // ms per character when typing in
const CYCLES = 3                // number of verb switches before settling
const PAUSE_BETWEEN = 3200      // ms to hold the fully typed verb before switching

/**
 * Returns a thinking verb that streams in character-by-character.
 * On activation, cycles through a few random verbs with a typewriter effect,
 * then settles on the last one.
 */
export function useThinkingVerb(active: boolean): { text: string; cycleKey: number } {
  const [display, setDisplay] = useState(() => pickRandom())
  const [cycleKey, setCycleKey] = useState(0)
  const cycleRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const rafRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearTimers = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    if (rafRef.current) clearTimeout(rafRef.current)
    timerRef.current = null
    rafRef.current = null
  }, [])

  const streamIn = useCallback((word: string, onDone: () => void) => {
    let i = 0
    const tick = () => {
      i++
      setDisplay(word.slice(0, i))
      if (i < word.length) {
        rafRef.current = setTimeout(tick, CHAR_INTERVAL)
      } else {
        onDone()
      }
    }
    setDisplay('')
    rafRef.current = setTimeout(tick, CHAR_INTERVAL)
  }, [])

  useEffect(() => {
    if (!active) {
      clearTimers()
      cycleRef.current = 0
      return
    }

    let cancelled = false
    let prevVerb = ''

    const nextCycle = () => {
      if (cancelled) return
      const verb = pickRandom(prevVerb)
      prevVerb = verb
      cycleRef.current++

      setCycleKey(cycleRef.current)
      streamIn(verb, () => {
        if (cancelled) return
        if (cycleRef.current < CYCLES) {
          timerRef.current = setTimeout(nextCycle, PAUSE_BETWEEN)
        }
      })
    }

    nextCycle()

    return () => {
      cancelled = true
      clearTimers()
    }
  }, [active, streamIn, clearTimers])

  return { text: display, cycleKey }
}
