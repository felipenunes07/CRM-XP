import { jsx as _jsx } from "react/jsx-runtime";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { IdeaBoardPageView } from "./IdeaBoardPageView";
import { buildIdeaBoardLanes, buildIdeaCreatePayload, buildIdeaTimeline, getIdeaLaneId, getIdeaVoteDraft, } from "./ideaBoardPage.helpers";
vi.mock("../hooks/useAuth", () => ({
    useAuth: () => ({
        user: {
            name: "Administrador Local",
            role: "ADMIN",
        },
    }),
}));
const ideas = [
    {
        id: "idea-1",
        title: "Melhorar campanhas",
        description: "Organizar melhor as aprovacoes.",
        status: "OPEN",
        isAnonymous: true,
        authorDisplayName: "Anonimo",
        canDelete: true,
        createdAt: "2026-04-17T12:00:00.000Z",
        updatedAt: "2026-04-17T12:00:00.000Z",
        voteSummary: {
            likeCount: 2,
            maybeCount: 1,
            noCount: 0,
            totalVotes: 3,
        },
        feedbackCount: 1,
        currentUserVote: {
            option: "NO",
            comment: "Agora nao.",
            createdAt: "2026-04-17T12:00:00.000Z",
            updatedAt: "2026-04-17T12:00:00.000Z",
        },
    },
    {
        id: "idea-2",
        title: "Vender minimo 500",
        description: "Criar regra nova no comercial.",
        status: "OPEN",
        isAnonymous: true,
        authorDisplayName: "Anonimo",
        canDelete: false,
        createdAt: "2026-04-16T12:00:00.000Z",
        updatedAt: "2026-04-17T14:00:00.000Z",
        voteSummary: {
            likeCount: 0,
            maybeCount: 0,
            noCount: 1,
            totalVotes: 1,
        },
        feedbackCount: 0,
        currentUserVote: null,
    },
];
const referenceTime = new Date("2026-04-22T12:00:00.000Z");
describe("IdeaBoard frontend", () => {
    it("renders the sidebar link and the ideas route outlet", () => {
        const markup = renderToStaticMarkup(_jsx(MemoryRouter, { initialEntries: ["/ideias-votacao"], children: _jsx(Routes, { children: _jsx(Route, { element: _jsx(AppShell, {}), children: _jsx(Route, { path: "/ideias-votacao", element: _jsx("div", { children: "Conteudo da aba" }) }) }) }) }));
        expect(markup).toContain("Ideias/Votacao");
        expect(markup).toContain("Conteudo da aba");
    });
    it("shows the canvas view, aggregate results and whatsapp notification button without exposing the current vote", () => {
        const markup = renderToStaticMarkup(_jsx(IdeaBoardPageView, { ideas: ideas, lanes: buildIdeaBoardLanes(ideas, referenceTime), timeline: buildIdeaTimeline(ideas, 4), activeLaneId: "ALL", selectedIdea: {
                id: "idea-1",
                title: "Melhorar campanhas",
                description: "Organizar melhor as aprovacoes.",
                status: "OPEN",
                isAnonymous: true,
                authorDisplayName: "Anonimo",
                canDelete: true,
                createdAt: "2026-04-17T12:00:00.000Z",
                updatedAt: "2026-04-17T12:00:00.000Z",
                voteSummary: {
                    likeCount: 2,
                    maybeCount: 1,
                    noCount: 0,
                    totalVotes: 3,
                },
                feedbackCount: 1,
                currentUserVote: {
                    option: "NO",
                    comment: "Agora nao.",
                    createdAt: "2026-04-17T12:00:00.000Z",
                    updatedAt: "2026-04-17T12:00:00.000Z",
                },
                feedbacks: [
                    {
                        id: "feedback-1",
                        ideaId: "idea-1",
                        option: "MAYBE",
                        comment: "Talvez valha pilotar antes.",
                        createdAt: "2026-04-17T12:12:00.000Z",
                        updatedAt: "2026-04-17T12:12:00.000Z",
                    },
                ],
            }, isCreateModalOpen: false, createDraft: {
                title: "",
                description: "",
                isAnonymous: true,
                authorDisplayName: "",
            }, voteDraft: {
                option: null,
                comment: "",
            }, createError: null, voteError: null, deleteError: null, notifyError: null, toastMessage: "Voto salvo anonimamente.", isIdeasLoading: false, isIdeaLoading: false, isCreating: false, isVoting: false, isDeleting: false, isNotifying: false, onActiveLaneChange: () => undefined, onCreateDraftChange: () => undefined, onVoteDraftChange: () => undefined, onOpenCreateModal: () => undefined, onCloseCreateModal: () => undefined, onCreateIdea: () => undefined, onDeleteIdea: () => undefined, onNotifyWhatsapp: () => undefined, onSubmitVote: () => undefined, onSelectIdea: () => undefined, onCloseIdea: () => undefined, onDismissToast: () => undefined }));
        expect(markup).toContain("Board em colunas no modelo Trello");
        expect(markup).toContain("Novas na mesa por 24h");
        expect(markup).toContain("Avisar time no WhatsApp");
        expect(markup).toContain("Voto salvo anonimamente.");
        expect(markup).toContain("Comentarios anonimos");
        expect(markup).not.toContain("Seu voto");
    });
    it("shows the display-name field only when the author chooses to identify themselves", () => {
        const anonymousMarkup = renderToStaticMarkup(_jsx(IdeaBoardPageView, { ideas: [], lanes: buildIdeaBoardLanes([]), timeline: buildIdeaTimeline([], 4), activeLaneId: "ALL", selectedIdea: null, isCreateModalOpen: true, createDraft: {
                title: "",
                description: "",
                isAnonymous: true,
                authorDisplayName: "",
            }, voteDraft: { option: null, comment: "" }, createError: null, voteError: null, deleteError: null, notifyError: null, toastMessage: null, isIdeasLoading: false, isIdeaLoading: false, isCreating: false, isVoting: false, isDeleting: false, isNotifying: false, onActiveLaneChange: () => undefined, onCreateDraftChange: () => undefined, onVoteDraftChange: () => undefined, onOpenCreateModal: () => undefined, onCloseCreateModal: () => undefined, onCreateIdea: () => undefined, onDeleteIdea: () => undefined, onNotifyWhatsapp: () => undefined, onSubmitVote: () => undefined, onSelectIdea: () => undefined, onCloseIdea: () => undefined, onDismissToast: () => undefined }));
        const identifiedMarkup = renderToStaticMarkup(_jsx(IdeaBoardPageView, { ideas: [], lanes: buildIdeaBoardLanes([]), timeline: buildIdeaTimeline([], 4), activeLaneId: "ALL", selectedIdea: null, isCreateModalOpen: true, createDraft: {
                title: "",
                description: "",
                isAnonymous: false,
                authorDisplayName: "",
            }, voteDraft: { option: null, comment: "" }, createError: null, voteError: null, deleteError: null, notifyError: null, toastMessage: null, isIdeasLoading: false, isIdeaLoading: false, isCreating: false, isVoting: false, isDeleting: false, isNotifying: false, onActiveLaneChange: () => undefined, onCreateDraftChange: () => undefined, onVoteDraftChange: () => undefined, onOpenCreateModal: () => undefined, onCloseCreateModal: () => undefined, onCreateIdea: () => undefined, onDeleteIdea: () => undefined, onNotifyWhatsapp: () => undefined, onSubmitVote: () => undefined, onSelectIdea: () => undefined, onCloseIdea: () => undefined, onDismissToast: () => undefined }));
        expect(anonymousMarkup).not.toContain("Nome para exibir");
        expect(identifiedMarkup).toContain("Nome para exibir");
    });
    it("builds the create payload, restores the current vote draft and creates a timeline", () => {
        expect(buildIdeaCreatePayload({
            title: "  Melhorar onboarding  ",
            description: "  Centralizar os passos.  ",
            isAnonymous: true,
            authorDisplayName: "Nao deve aparecer",
        })).toEqual({
            title: "Melhorar onboarding",
            description: "Centralizar os passos.",
            isAnonymous: true,
            authorDisplayName: undefined,
        });
        expect(getIdeaVoteDraft({
            currentUserVote: {
                option: "NO",
                comment: "Agora nao.",
                createdAt: "2026-04-17T12:00:00.000Z",
                updatedAt: "2026-04-17T12:00:00.000Z",
            },
        })).toEqual({
            option: "NO",
            comment: "Agora nao.",
        });
        expect(buildIdeaTimeline(ideas, 4)).toHaveLength(4);
    });
    it("classifies ideas into mural lanes", () => {
        expect(getIdeaLaneId({
            createdAt: "2026-04-22T04:00:00.000Z",
            voteSummary: {
                likeCount: 0,
                maybeCount: 0,
                noCount: 0,
                totalVotes: 0,
            },
        }, referenceTime)).toBe("INBOX");
        expect(getIdeaLaneId({
            createdAt: "2026-04-20T04:00:00.000Z",
            voteSummary: {
                likeCount: 3,
                maybeCount: 1,
                noCount: 0,
                totalVotes: 4,
            },
        }, referenceTime)).toBe("SUPPORT");
        expect(getIdeaLaneId({
            createdAt: "2026-04-20T04:00:00.000Z",
            voteSummary: {
                likeCount: 1,
                maybeCount: 0,
                noCount: 4,
                totalVotes: 5,
            },
        }, referenceTime)).toBe("STOP");
        expect(getIdeaLaneId({
            createdAt: "2026-04-20T04:00:00.000Z",
            voteSummary: {
                likeCount: 1,
                maybeCount: 2,
                noCount: 2,
                totalVotes: 5,
            },
        }, referenceTime)).toBe("REFINE");
    });
});
