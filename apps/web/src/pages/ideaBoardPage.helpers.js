export const emptyIdeaCreateDraft = {
    title: "",
    description: "",
    isAnonymous: true,
    authorDisplayName: "",
};
export const emptyIdeaVoteDraft = {
    option: null,
    comment: "",
};
export const ideaVoteOptions = [
    {
        option: "LIKE",
        label: "Sim, gostei",
        description: "A ideia faz sentido e pode avancar.",
    },
    {
        option: "MAYBE",
        label: "Talvez, pensar mais",
        description: "Tem potencial, mas precisa de lapidacao.",
    },
    {
        option: "NO",
        label: "Melhor nao",
        description: "Nao parece ser a melhor direcao agora.",
    },
];
const laneBlueprints = [
    {
        id: "ALL",
        title: "Todas",
        description: "Tudo em um lugar para acompanhar o resultado sem perder o card.",
        accentClassName: "neutral",
    },
    {
        id: "INBOX",
        title: "Novas na mesa",
        description: "Entraram agora e ainda precisam de leitura do time.",
        accentClassName: "neutral",
    },
    {
        id: "SUPPORT",
        title: "Gostei / seguir",
        description: "O consenso puxa para apoio e continuidade.",
        accentClassName: "success",
    },
    {
        id: "REFINE",
        title: "Refinar melhor",
        description: "Pede debate, teste ou algum amadurecimento.",
        accentClassName: "warning",
    },
    {
        id: "STOP",
        title: "Nao priorizar",
        description: "A leitura atual do board puxa para frear.",
        accentClassName: "danger",
    },
];
function getVoteCounts(idea) {
    return {
        LIKE: idea.voteSummary.likeCount,
        MAYBE: idea.voteSummary.maybeCount,
        NO: idea.voteSummary.noCount,
    };
}
export function getDominantVote(idea) {
    const counts = getVoteCounts(idea);
    const ordered = Object.entries(counts).sort((left, right) => right[1] - left[1]);
    const [top, second] = ordered;
    if (!top || top[1] <= 0) {
        return "NONE";
    }
    if (second && second[1] === top[1]) {
        return "TIE";
    }
    return top[0];
}
export function getIdeaLaneId(idea) {
    if (idea.voteSummary.totalVotes === 0) {
        return "INBOX";
    }
    const dominantVote = getDominantVote(idea);
    if (dominantVote === "LIKE") {
        return "SUPPORT";
    }
    if (dominantVote === "NO") {
        return "STOP";
    }
    return "REFINE";
}
export function buildIdeaBoardLanes(ideas) {
    const byLane = new Map(laneBlueprints.map((lane) => [lane.id, []]));
    ideas.forEach((idea) => {
        byLane.get("ALL")?.push(idea);
        byLane.get(getIdeaLaneId(idea))?.push(idea);
    });
    return laneBlueprints.map((lane) => ({
        ...lane,
        items: byLane.get(lane.id) ?? [],
    }));
}
export function getIdeaLaneTitle(laneId) {
    return laneBlueprints.find((lane) => lane.id === laneId)?.title ?? laneId;
}
export function buildIdeaCreatePayload(draft) {
    const title = draft.title.trim();
    const description = draft.description.trim();
    const authorDisplayName = draft.authorDisplayName.trim();
    if (!title) {
        throw new Error("Informe o titulo da ideia.");
    }
    if (!description) {
        throw new Error("Explique a ideia para o time.");
    }
    if (!draft.isAnonymous && !authorDisplayName) {
        throw new Error("Informe o nome que deve aparecer na ideia.");
    }
    return {
        title,
        description,
        isAnonymous: draft.isAnonymous,
        authorDisplayName: draft.isAnonymous ? undefined : authorDisplayName,
    };
}
export function buildIdeaVotePayload(draft) {
    if (!draft.option) {
        throw new Error("Escolha uma opcao de voto antes de salvar.");
    }
    return {
        option: draft.option,
        comment: draft.comment.trim() || undefined,
    };
}
export function getIdeaVoteDraft(detail) {
    return {
        option: detail?.currentUserVote?.option ?? null,
        comment: detail?.currentUserVote?.comment ?? "",
    };
}
export function buildIdeaTimeline(ideas, days = 10) {
    const now = new Date();
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - (days - 1));
    const ideasByDate = new Map();
    const sortedIdeas = [...ideas].sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime());
    sortedIdeas.forEach((idea) => {
        const createdAt = new Date(idea.createdAt);
        createdAt.setHours(0, 0, 0, 0);
        const key = createdAt.toISOString().slice(0, 10);
        ideasByDate.set(key, (ideasByDate.get(key) ?? 0) + 1);
    });
    let totalCount = sortedIdeas.filter((idea) => new Date(idea.createdAt) < start).length;
    return Array.from({ length: days }, (_, index) => {
        const current = new Date(start);
        current.setDate(start.getDate() + index);
        const key = current.toISOString().slice(0, 10);
        const createdCount = ideasByDate.get(key) ?? 0;
        totalCount += createdCount;
        return {
            key,
            label: current.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
            createdCount,
            totalCount,
        };
    });
}
export function formatIdeaStatus(status) {
    return status === "OPEN" ? "Votacao aberta" : "Votacao encerrada";
}
export function formatIdeaVoteOption(option) {
    return ideaVoteOptions.find((item) => item.option === option)?.label ?? option;
}
export function getIdeaVoteRatio(idea, option) {
    const total = idea.voteSummary.totalVotes || 1;
    const count = option === "LIKE"
        ? idea.voteSummary.likeCount
        : option === "MAYBE"
            ? idea.voteSummary.maybeCount
            : idea.voteSummary.noCount;
    return Math.round((count / total) * 100);
}
export function truncateIdeaCopy(value, maxLength = 190) {
    const normalized = value.replace(/\s+/g, " ").trim();
    if (normalized.length <= maxLength) {
        return normalized;
    }
    return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}...`;
}
