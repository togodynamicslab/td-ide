import { useState, useEffect } from 'react'

const THINKING_VERBS = [
  'Accomplishing', 'Actioning', 'Actualizing', 'Baking', 'Booping', 'Brewing',
  'Calculating', 'Cerebrating', 'Channelling', 'Churning', 'Clauding', 'Coalescing',
  'Cogitating', 'Combobulating', 'Computing', 'Concocting', 'Conjuring', 'Considering',
  'Contemplating', 'Cooking', 'Crafting', 'Creating', 'Crunching', 'Deciphering',
  'Deliberating', 'Determining', 'Discombobulating', 'Divining', 'Doing', 'Effecting',
  'Elucidating', 'Enchanting', 'Envisioning', 'Finagling', 'Flibbertigibbeting',
  'Forging', 'Forming', 'Frolicking', 'Generating', 'Germinating', 'Hatching',
  'Herding', 'Honking', 'Hustling', 'Ideating', 'Imagining', 'Incubating', 'Inferring',
  'Jiving', 'Manifesting', 'Marinating', 'Meandering', 'Moseying', 'Mulling',
  'Mustering', 'Musing', 'Noodling', 'Percolating', 'Perusing', 'Philosophising',
  'Pondering', 'Pontificating', 'Processing', 'Puttering', 'Puzzling', 'Reticulating',
  'Ruminating', 'Scheming', 'Schlepping', 'Shimmying', 'Shucking', 'Simmering',
  'Smooshing', 'Spelunking', 'Spinning', 'Stewing', 'Sussing', 'Synthesizing',
  'Thinking', 'Tinkering', 'Transmuting', 'Unfurling', 'Unravelling', 'Vibing',
  'Wandering', 'Whirring', 'Wibbling', 'Wizarding', 'Working', 'Wrangling'
]

function pickRandom(): string {
  return THINKING_VERBS[Math.floor(Math.random() * THINKING_VERBS.length)]
}

/**
 * Returns a single random thinking verb, picked fresh each time `active`
 * transitions from false → true. Stays fixed for the entire loading session.
 */
export function useThinkingVerb(active: boolean): string {
  const [verb, setVerb] = useState(pickRandom)

  useEffect(() => {
    if (active) {
      setVerb(pickRandom())
    }
  }, [active])

  return verb
}
