import { create } from "zustand";

type WorkspaceState = {
  selectedPostId: string;
  setSelectedPostId: (postId: string) => void;
};

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  selectedPostId: "1",
  setSelectedPostId: (postId) => set({ selectedPostId: postId }),
}));
