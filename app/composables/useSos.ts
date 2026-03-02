import { computed } from 'vue';

export type SosEntry = 'panic' | 'tension' | 'vent';
export type SosOpenEntry = SosEntry | 'technique_picker';

export type SosStep =
  | 'select'
  | 'panic-grounding'
  | 'panic-breathing'
  | 'tension-practice'
  | 'finish';

interface SosFinishPayload {
  entry: Exclude<SosEntry, 'vent'>;
}

interface SosState {
  isOpen: boolean;
  step: SosStep;
  finish: SosFinishPayload | null;
}

function resolveInitialStep(entry?: SosOpenEntry): SosStep {
  if (!entry) return 'select';
  if (entry === 'panic') return 'panic-grounding';
  if (entry === 'technique_picker') return 'select';
  if (entry === 'tension') return 'tension-practice';
  return 'select';
}

function createInitialState(): SosState {
  return {
    isOpen: false,
    step: 'select',
    finish: null,
  };
}

export function useSos() {
  const state = useState<SosState>('sos-state', createInitialState);

  const isOpen = computed(() => state.value.isOpen);
  const step = computed(() => state.value.step);
  const finish = computed(() => state.value.finish);

  function open(entry?: SosOpenEntry) {
    state.value.isOpen = true;
    state.value.step = resolveInitialStep(entry);
    state.value.finish = null;
  }

  function close() {
    state.value = createInitialState();
  }

  function setStep(next: SosStep) {
    state.value.step = next;
  }

  function setFinish(entry: Exclude<SosEntry, 'vent'>) {
    state.value.step = 'finish';
    state.value.finish = { entry };
  }

  return {
    state,
    isOpen,
    step,
    finish,
    open,
    close,
    setStep,
    setFinish,
  };
}
