resolveSingleChange: async (commitId, changeId, action) => {
    const state = get();
    const api = getElectronBridge();
    if (!api) return;

    const commit = state.pendingCommits.find((c) => c.id === commitId);
    const changeItem = commit?.changes.find((c) => c.id === changeId);
    const entityType = changeItem ? changeItem.type : "profile";

    if (action === "approve") {
      if (entityType === "profile") {
        const result = await api.gitApproveProfile?.(changeId);
        if (result?.success) {
          (db as any).isSyncingInternal = true;
          try {
            const updatedProfiles = await getAllProfiles();
            const targetProfile = updatedProfiles.find((p: any) => p.id === changeId);
            if (targetProfile) {
              await upsertProfile({
                ...targetProfile,
                status: "approved",
              });
            }
          } finally {
            (db as any).isSyncingInternal = false;
          }
        }
      } else if (entityType === "standard") {
        const result = await api.gitApproveStandard?.({
          repoPath: state.gitRepoPath,
          standardId: changeId,
        });

        if (result?.success) {
          (db as any).isSyncingInternal = true;
          try {
            const targetStandard = await db.standards.get(changeId);
            if (targetStandard) {
              const approvedStandard: any = {
                ...targetStandard,
                status: "approved",
                manifest: {
                  ...targetStandard.manifest,
                  isBuiltin: false,
                },
              };
              await upsertStandard(approvedStandard);
            }
          } finally {
            (db as any).isSyncingInternal = false;
          }
        }
      }
    } else if (action === "reject") {
      // 🟢 CORRECTION DU BOOMERANG : Suppression effective côté Electron/Git
      if (entityType === "profile") {
        if (api.gitRejectProfile) {
          await api.gitRejectProfile(changeId);
        }
        (db as any).isSyncingInternal = true;
        try {
          const targetProfile = await db.profiles.get(changeId);
          if (targetProfile) {
            await upsertProfile({ ...targetProfile, status: "local" as const });
          }
        } finally {
          (db as any).isSyncingInternal = false;
        }
      } else if (entityType === "standard") {
        if (api.gitRejectStandard) {
          await api.gitRejectStandard({
            repoPath: state.gitRepoPath,
            standardId: changeId,
          });
        }
        (db as any).isSyncingInternal = true;
        try {
          const targetStandard = await db.standards.get(changeId);
          if (targetStandard) {
            await upsertStandard({ ...targetStandard, status: "local" as const });
          }
        } finally {
          (db as any).isSyncingInternal = false;
        }
      }
    }

    // 🟢 Retire immédiatement la carte de l'interface admin sans relancer une synchro Git complète en boucle
    set((s) => ({
      pendingCommits: s.pendingCommits.filter((c) => c.id !== commitId),
    }));

    await get().refreshLocalChanges();
  }
}));
