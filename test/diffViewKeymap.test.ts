import { describe, expect, test } from "bun:test"
import { createDispatcher, parseKey } from "@ghui/keymap"
import { diffViewKeymap } from "../src/keymap/diffView.ts"

describe("diffViewKeymap", () => {
	test("supports contextual reviewed toggle", () => {
		const log: string[] = []
		const dispatcher = createDispatcher(diffViewKeymap, () => ({
			halfPage: 10,
			handleEscape: () => log.push("escape"),
			openSelectedComment: () => log.push("comment"),
			toggleRange: () => log.push("range"),
			toggleView: () => log.push("view"),
			toggleWrap: () => log.push("wrap"),
			reload: () => log.push("reload"),
			nextThread: () => log.push("next-thread"),
			previousThread: () => log.push("previous-thread"),
			moveAnchor: (delta: number) => log.push(`move:${delta}`),
			moveAnchorToBoundary: (boundary: "first" | "last") => log.push(`boundary:${boundary}`),
			alignAnchor: (align: "center" | "top" | "bottom") => log.push(`align:${align}`),
			selectSide: (side: "LEFT" | "RIGHT") => log.push(`side:${side}`),
			openChangedFiles: () => log.push("files"),
			openSubmitReview: () => log.push("submit-review"),
			explainRange: () => log.push("explain"),
			askQuestion: () => log.push("ask"),
			toggleReviewed: () => log.push("reviewed"),
			nextFile: () => log.push("next-file"),
			previousFile: () => log.push("previous-file"),
			openInBrowser: () => log.push("browser"),
		}))

		dispatcher.dispatch(parseKey("q"))
		dispatcher.dispatch(parseKey("c"))

		expect(log).toEqual(["ask", "reviewed"])
	})
})
