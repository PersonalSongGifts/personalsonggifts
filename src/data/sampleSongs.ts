export interface SampleSong {
  id: string;
  title: string;
  occasion: string;
  genre: string;
  duration: string;
  audioSrc: string;
}

export const sampleSongs: SampleSong[] = [
  { id: "1", title: "My Favorite Yes", occasion: "Anniversary", genre: "Country", duration: "2:39", audioSrc: "/audio/my-favorite-yes.mp3" },
  { id: "2", title: "All My Love", occasion: "Lullaby", genre: "Soft/Emotional", duration: "2:56", audioSrc: "/audio/all-my-love.mp3" },
  { id: "3", title: "33 Valentines", occasion: "Valentine's Day", genre: "90s Love Ballad", duration: "3:12", audioSrc: "/audio/33-valentines.mp3" },
  { id: "4", title: "Because of You Mama", occasion: "Mother's Day", genre: "Love Ballad", duration: "3:28", audioSrc: "/audio/because-of-you-mama.mp3" },
  { id: "5", title: "You Led the Way", occasion: "Father's Day", genre: "Classic Rock", duration: "3:18", audioSrc: "/audio/you-led-the-way.mp3" },
];

export const sampleSongById = (id: string) => sampleSongs.find((s) => s.id === id);
