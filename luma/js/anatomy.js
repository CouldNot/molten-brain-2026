// What the 3D model shows and says: brain regions (meshes from molten-brain),
// tap-to-explain sites, the device placements and the educational pathways.
// Coordinates are molten-brain's, and are also the world units of the
// scene: x left(-)/right(+), y down(-)/up(+),
// z posterior(-)/anterior(+), arbitrary units. The neck sits at y ≈ -4 to -8.

export const BRAIN_SCALE = 0.026;
/** Roughly the middle of the meshes, so the brain sits centred in the head. */
export const BRAIN_CENTER = [0, -0.3, -0.6];

/**
 * Every baked molten-brain mesh. `site` groups meshes for pathway highlights
 * (the three brainstem pieces light together); `info` picks the tap text.
 * `group` drives the resting hologram tint. `bilateral` meshes are mirrored to x < 0.
 */
export const REGIONS = [
  { mesh: "frontal", pos: [0.85, 1.0, 2.2], bilateral: true, group: "cortex" },
  { mesh: "parietal", pos: [0.85, 1.8, -0.2], bilateral: true, group: "cortex" },
  { mesh: "temporal", pos: [2.1, -0.75, 0.6], bilateral: true, group: "cortex" },
  { mesh: "occipital", pos: [0.72, 0.75, -2.9], bilateral: true, group: "cortex", site: "visual_cortex" },
  { mesh: "insula", pos: [1.95, 0.3, 0.5], bilateral: true, group: "cortex" },
  { mesh: "cingulate", pos: [0.5, 0.6, 0.0], bilateral: true, group: "limbic" },
  { mesh: "caudate", pos: [1.2, 1.1, 0.8], bilateral: true, group: "basal" },
  { mesh: "putamen", pos: [1.9, 0.2, 0.6], bilateral: true, group: "basal" },
  { mesh: "globus_pallidus", pos: [1.5, 0.0, 0.2], bilateral: true, group: "basal" },
  { mesh: "claustrum", pos: [2.3, 0.1, 0.5], bilateral: true, group: "basal" },
  { mesh: "accumbens", pos: [0.95, -0.5, 1.0], bilateral: true, group: "basal" },
  { mesh: "subthalamic_nucleus", pos: [0.75, -0.35, -0.55], bilateral: true, group: "basal" },
  { mesh: "substantia_nigra", pos: [0.55, -0.6, -0.6], bilateral: true, group: "basal" },
  { mesh: "thalamus", pos: [0.9, 0.4, -0.6], bilateral: true, group: "dien" },
  { mesh: "hypothalamus", pos: [0.45, -0.45, 0.3], bilateral: true, group: "dien" },
  { mesh: "pituitary", pos: [0.0, -1.0, 0.35], group: "dien" },
  { mesh: "hippocampus", pos: [1.3, -0.7, -0.2], bilateral: true, group: "limbic" },
  { mesh: "amygdala", pos: [1.45, -0.35, 0.95], bilateral: true, group: "limbic" },
  { mesh: "septal_nuclei", pos: [0.3, 0.1, 0.85], bilateral: true, group: "limbic" },
  { mesh: "olfactory_bulb", pos: [0.45, -1.05, 2.7], bilateral: true, group: "limbic" },
  { mesh: "cerebellum", pos: [0.0, -1.55, -3.3], group: "cortex" },
  { mesh: "midbrain", pos: [0.0, -0.51, -0.66], group: "stem", site: "brainstem" },
  { mesh: "pons", pos: [0.0, -1.43, -0.45], group: "stem", site: "brainstem" },
  { mesh: "medulla", pos: [0.0, -2.61, -0.75], group: "stem", site: "brainstem" },
  { mesh: "locus_coeruleus", pos: [0.3, -1.0, -0.95], bilateral: true, group: "nuclei" },
  { mesh: "raphe", pos: [0.0, -1.5, -0.6], group: "nuclei" },
];

/** Resting hologram looks per group: cool cortex shell, softer coloured interior. */
export const GROUP_LOOKS = {
  cortex: { color: "#3f8cff", base: 0.012, rim: 0.62, power: 2.6 },
  basal: { color: "#2fd0c0", base: 0.02, rim: 0.5, power: 2.0 },
  dien: { color: "#6d95ff", base: 0.022, rim: 0.55, power: 2.0 },
  limbic: { color: "#9580ff", base: 0.02, rim: 0.5, power: 2.0 },
  stem: { color: "#5fa6ff", base: 0.025, rim: 0.6, power: 2.0 },
  nuclei: { color: "#ffb84a", base: 0.06, rim: 0.6, power: 1.6 },
};

export const EYES = { pos: [1.25, -1.05, 3.72], radius: 0.46 };
export const SPINAL_CORD = [[0, -2.9, -0.8], [0, -4.6, -0.95], [0, -6.6, -1.05], [0, -9.0, -1.1], [0, -11.6, -1.15]];

/** Small brainstem relays drawn as glowing nodes (no mesh of their own). */
export const NODES = {
  nts: [0.15, -2.65, -0.85],
  trigeminal_nucleus: [0.38, -2.22, -0.71],
  tcc: [0.28, -3.15, -0.9],
  pain_control: [0.0, -0.45, -0.95],
};

/** Tap targets. `name` is the heading, `text` the one-sentence explanation. */
export const SITES = {
  eyes: { name: "Eyes", text: "The retina turns light into nerve signals that travel toward the thalamus." },
  thalamus: { name: "Thalamus", text: "A relay hub deep in the brain that helps route incoming sensory information." },
  visual_cortex: { name: "Visual cortex", text: "Processes what the person sees; in migraine, visual processing can feel unusually sensitive." },
  brainstem: { name: "Brainstem", text: "Links the brain and spinal cord, and holds the relays for pain signals from the head and face." },
  spinal_cord: { name: "Upper spinal cord", text: "Carries signals from the neck up into the brainstem." },
  trigeminal: { name: "Trigeminal nerve", text: "Carries sensation, including migraine pain, from the face and head into the brainstem." },
  trigeminal_nucleus: { name: "Trigeminal pain relay", text: "The brainstem nucleus that relays migraine pain from the trigeminal nerve onward." },
  device: { name: "Wearable", text: "Vibration (and possibly temperature) on the skin, tuned to your data within hard-coded safety limits." },
  vagus_nerve: { name: "Vagus nerve", text: "Runs down the side of the neck beside the carotid artery; most of its fibers carry signals up to the brainstem." },
  auricular_branch: { name: "Ear branch of the vagus", text: "A small vagus branch supplying skin of the outer ear; ear vagus stimulation is well studied." },
  occipital_nerves: { name: "Occipital nerves", text: "Carry sensation from the back of the head; they are a separate, real migraine target." },
  nts: { name: "NTS (vagus relay)", text: "The nucleus tractus solitarius: the brainstem's main entry point for vagus signals." },
  tcc: { name: "Trigeminocervical complex", text: "Where pain signals from the head and upper neck meet, in the lower brainstem and upper spinal cord." },
  pain_control: { name: "Pain-dampening areas", text: "Brainstem areas that can turn pain signals down." },
  // Context regions: every other structure in the model, one line each.
  frontal: { name: "Frontal lobe", text: "Planning, attention and decision-making." },
  parietal: { name: "Parietal lobe", text: "Processes touch and where the body is in space." },
  temporal: { name: "Temporal lobe", text: "Hearing, language and memory." },
  occipital: { name: "Visual cortex", text: "Processes what the person sees; in migraine, visual processing can feel unusually sensitive." },
  insula: { name: "Insula", text: "Reads the body's internal state, including pain and discomfort." },
  cingulate: { name: "Cingulate gyrus", text: "Links emotion and attention; part of how pain feels unpleasant." },
  caudate: { name: "Caudate nucleus", text: "Part of the basal ganglia, involved in learning and habits." },
  putamen: { name: "Putamen", text: "Part of the basal ganglia, helping control movement." },
  globus_pallidus: { name: "Globus pallidus", text: "Basal ganglia output station that regulates movement." },
  claustrum: { name: "Claustrum", text: "A thin sheet of neurons connected to most of the cortex." },
  accumbens: { name: "Nucleus accumbens", text: "Reward and motivation hub." },
  subthalamic_nucleus: { name: "Subthalamic nucleus", text: "A small basal ganglia nucleus that helps stop movements." },
  substantia_nigra: { name: "Substantia nigra", text: "Makes dopamine for movement control." },
  hypothalamus: { name: "Hypothalamus", text: "Runs sleep, hunger and hormones; linked to the early warning phase of migraine." },
  pituitary: { name: "Pituitary gland", text: "The hormone gland the hypothalamus controls." },
  hippocampus: { name: "Hippocampus", text: "Forms new memories." },
  amygdala: { name: "Amygdala", text: "Processes threat and emotion, including the emotional side of pain." },
  septal_nuclei: { name: "Septal nuclei", text: "Small limbic nuclei involved in reward and calm." },
  olfactory_bulb: { name: "Olfactory bulb", text: "First stop for smell; smells can be a migraine trigger." },
  cerebellum: { name: "Cerebellum", text: "Coordinates movement and balance." },
  midbrain: { name: "Midbrain", text: "Top of the brainstem; holds areas that can turn pain down." },
  pons: { name: "Pons", text: "Middle of the brainstem, where the trigeminal nerve enters." },
  medulla: { name: "Medulla", text: "Lowest part of the brainstem; holds the vagus relay (NTS) and the trigeminal pain relay." },
  locus_coeruleus: { name: "Locus coeruleus", text: "Makes noradrenaline for alertness; it also helps regulate pain." },
  raphe: { name: "Raphe nuclei", text: "Make serotonin, a messenger tied to migraine and pain control." },
};

/** Where each site's floating name tag sits (brain coordinates). */
export const LABEL_AT = {
  eyes: [1.5, -0.3, 4.4],
  thalamus: [-1.1, 1.2, -0.7],
  visual_cortex: [0.9, 1.1, -4.0],
  brainstem: [-0.9, -1.2, -0.3],
  spinal_cord: [-0.75, -5.0, -1.1],
  trigeminal: [2.8, -0.9, 2.3],
  trigeminal_nucleus: [2.7, -2.4, -0.5],
  vagus_nerve: [1.75, -4.7, -0.1],
  auricular_branch: [4.2, -1.9, -0.8],
  occipital_nerves: [1.5, -5.2, -2.4],
  nts: [-2.7, -3.3, -0.9],
  tcc: [-2.6, -4.1, -1.0],
  pain_control: [-2.5, 0.1, -1.0],
};

export const PATHWAY_COLORS = { device: "#b18cff", visual: "#ffa040", migraine: "#ff5468" };

/**
 * Device placements, from the project overview's open question. Each carries its
 * own route (skin -> nerve -> brainstem relay) and the PROPOSED link it is
 * testing, drawn dashed so it never reads as "the device activates migraine".
 */
export const PLACEMENTS = {
  side: {
    short: "Side of neck",
    label: "Side of neck (vagus)",
    route: [[1.08, -6.6, 0.08], [0.78, -6.2, -0.25], [0.7, -4.7, -0.42], [0.74, -3.45, -0.56], [0.42, -2.95, -0.78], [0.15, -2.65, -0.85]],
    marks: [{ at: 0, site: "device", step: 0 }, { at: 1, site: "vagus_nerve", step: 1 }, { at: 5, site: "nts", step: 2 }],
    proposed: { from: "nts", to: ["trigeminal_nucleus", "pain_control"] },
    steps: [
      { title: "Vibration on side of neck", text: "Receptors in the skin and tissue pick it up." },
      { title: "Vagus nerve", text: "Most of its fibers carry signals up to the brainstem." },
      { title: "Brainstem relay (NTS)", text: "The vagus nerve's main entry point." },
      { title: "Proposed link", text: "The NTS connects to the trigeminal pain relay and to areas that turn pain down." },
    ],
    note: "In animal studies, vagus stimulation lowers trigeminal pain signaling. An electrical side-of-neck device (gammaCore) is FDA-cleared for migraine; evidence that vibration reaches the vagus is early. That is what LUMA tests.",
  },
  ear: {
    short: "Ear",
    label: "Ear (vagus branch)",
    route: [[3.62, -0.95, -0.8], [3.0, -1.95, -0.9], [2.0, -2.9, -0.85], [1.0, -3.3, -0.7], [0.42, -2.95, -0.78], [0.15, -2.65, -0.85]],
    marks: [{ at: 0, site: "device", step: 0 }, { at: 1, site: "auricular_branch", step: 1 }, { at: 5, site: "nts", step: 2 }],
    proposed: { from: "nts", to: ["trigeminal_nucleus", "pain_control"] },
    steps: [
      { title: "Vibration at the ear", text: "Skin receptors in the outer ear pick it up." },
      { title: "Ear branch of the vagus", text: "Carries the signal toward the brainstem." },
      { title: "Brainstem relay (NTS)", text: "The vagus nerve's main entry point." },
      { title: "Proposed link", text: "The NTS connects to the trigeminal pain relay and to areas that turn pain down." },
    ],
    note: "Ear vagus stimulation is well studied with mild electrical current; evidence for vibration is early. That is what LUMA tests.",
  },
  back: {
    short: "Back of neck",
    label: "Back of neck (occipital)",
    route: [[0.38, -6.2, -1.86], [0.62, -5.65, -1.72], [0.45, -5.9, -1.34], [0.14, -5.25, -1.1], [0.2, -4.05, -0.98], [0.28, -3.15, -0.9]],
    marks: [{ at: 0, site: "device", step: 0 }, { at: 1, site: "occipital_nerves", step: 1 }, { at: 3, site: "spinal_cord", step: 2 }, { at: 5, site: "tcc", step: 3 }],
    proposed: { from: "tcc", to: ["trigeminal_nucleus"] },
    steps: [
      { title: "Vibration on back of neck", text: "Skin receptors pick it up." },
      { title: "Occipital nerves", text: "Carry sensation from the back of the head." },
      { title: "Upper spinal cord (C2)", text: "Where those nerves enter." },
      { title: "Trigeminocervical complex", text: "Where head and neck pain signals meet; occipital stimulation is thought to act here." },
    ],
    note: "This placement is occipital nerve stimulation, not vagus. Whether vibration here eases migraine is what LUMA tests.",
  },
};

export const PATHWAYS = {
  visual: {
    title: "Visual pathway",
    color: PATHWAY_COLORS.visual,
    strands: [
      [[1.25, -1.05, 3.5], [0.8, -1.1, 2.3], [0.15, -1.0, 1.1], [0.75, -0.7, 0.2], [1.2, -0.05, -1.0], [1.75, 0.15, -1.8], [1.25, 0.35, -2.8], [0.45, 0.3, -3.35]],
      [[-1.25, -1.05, 3.5], [-0.8, -1.1, 2.3], [-0.15, -1.0, 1.1], [-0.75, -0.7, 0.2], [-1.2, -0.05, -1.0], [-1.75, 0.15, -1.8], [-1.25, 0.35, -2.8], [-0.45, 0.3, -3.35]],
    ],
    marks: [{ at: 0, site: "eyes", step: 0 }, { at: 4, site: "thalamus", step: 1 }, { at: 7, site: "visual_cortex", step: 2 }],
    steps: [
      { title: "Eyes", text: "The retina turns light into nerve signals." },
      { title: "Thalamus", text: "Helps route sensory information." },
      { title: "Visual cortex", text: "Processes what the person sees." },
    ],
    note: "Migraine can make visual processing feel unusually sensitive, which is what the eye tracker's squint, blink and pupil readings pick up.",
  },
  migraine: {
    title: "Migraine pain pathway",
    color: PATHWAY_COLORS.migraine,
    optional: true,
    strands: [
      [[1.55, -0.15, 3.65], [1.55, -0.85, 2.6], [1.45, -1.4, 1.1], [1.35, -1.5, 0.35], [0.65, -1.45, -0.25], [0.38, -2.22, -0.71], [-0.2, -1.6, -0.62], [-0.42, -0.6, -0.75], [-0.95, 0.15, -0.45]],
    ],
    marks: [{ at: 2, site: "trigeminal", step: 0 }, { at: 5, site: "trigeminal_nucleus", step: 1 }, { at: 8, site: "thalamus", step: 2 }],
    steps: [
      { title: "Trigeminal nerve", text: "Carries head and facial sensation." },
      { title: "Brainstem", text: "The trigeminal relay passes pain signals on." },
      { title: "Thalamus", text: "Routes them toward the cortex." },
    ],
    note: "Involved in head and facial pain. The device is not shown activating it: the dashed line only marks the proposed link being tested.",
  },
};
