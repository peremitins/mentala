import { defineStore } from 'pinia';
import { useToast } from '@/app/composables/useToast';
import type {
  MeditationTrackDto,
  MeditationTopicDto,
} from '@/shared/dto/meditations';
import { useLoadersStore } from '@/app/stores/loaders';

interface MeditationsState {
  tracks: MeditationTrackDto[];
  topics: MeditationTopicDto[];
  error: string | null;
  hasFetched: boolean;
}

export const useMeditationsStore = defineStore('meditations', {
  state: (): MeditationsState => ({
    tracks: [],
    topics: [],
    error: null,
    hasFetched: false,
  }),
  getters: {
    byId: (state) => (id: string) =>
      state.tracks.find((track) => track.id === id),
    favoriteIds: (state) =>
      state.tracks.filter((track) => track.isFavorite).map((track) => track.id),
  },
  actions: {
    async fetchAll(force = false) {
      const loaders = useLoadersStore();

      if (loaders.isSkeletonLoading) return;
      if (!force && this.hasFetched) return;

      loaders.showSkeleton();
      this.error = null;

      try {
        const { $api } = useNuxtApp();
        const [topics, tracks] = await Promise.all([
          $api<MeditationTopicDto[]>('/api/meditations/topics'),
          $api<MeditationTrackDto[]>('/api/meditations'),
        ]);

        this.topics = topics;
        this.tracks = tracks;
        this.hasFetched = true;
      } catch (error: any) {
        this.error = error?.message || 'Не удалось загрузить медитации';
        console.error('[Meditations] fetchAll error:', error);
      } finally {
        loaders.hideSkeleton();
      }
    },
    async fetchTrack(id: string) {
      const existing = this.tracks.find((track) => track.id === id);
      if (existing) return existing;

      try {
        const { $api } = useNuxtApp();
        const track = await $api<MeditationTrackDto>(
          `/api/meditations/${id}`
        );
        this.tracks.push(track);
        return track;
      } catch (error: any) {
        console.error('[Meditations] fetchTrack error:', error);
        throw error;
      }
    },
    async toggleFavorite(trackId: string) {
      const track = this.tracks.find((item) => item.id === trackId);
      if (!track) return;

      const nextValue = !track.isFavorite;
      track.isFavorite = nextValue;

      try {
        const { $api } = useNuxtApp();
        if (nextValue) {
          await $api('/api/meditations/favorites', {
            method: 'POST',
            body: { trackId },
          });
        } else {
          await $api(`/api/meditations/favorites/${trackId}`, {
            method: 'DELETE',
          });
        }
      } catch (error: any) {
        // Возвращаем предыдущее состояние при ошибке
        track.isFavorite = !nextValue;
        console.error('[Meditations] toggleFavorite error:', error);
        useToast(error?.message || 'Не удалось обновить избранное');
      }
    },
    reset() {
      this.tracks = [];
      this.topics = [];
      this.error = null;
      this.hasFetched = false;
    },
  },
});
