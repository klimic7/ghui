import { describe, expect, test } from "bun:test"
import { createDispatcher, parseKey } from "@ghui/keymap"
import { codexExplanationModalKeymap } from "../src/keymap/codexExplanationModal.ts"

describe("codexExplanationModalKeymap", () => {
	test("supports close, copy, and scroll keys", () => {
		const log: string[] = []
		const dispatcher = createDispatcher(codexExplanationModalKeymap, () => ({
			halfPage: 10,
			closeModal: () => log.push("close"),
			copy: () => log.push("copy"),
			scrollBy: (delta: number) => log.push(`scroll:${delta}`),
		}))

		dispatcher.dispatch(parseKey("j"))
		dispatcher.dispatch(parseKey("ctrl+d"))
		dispatcher.dispatch(parseKey("y"))
		dispatcher.dispatch(parseKey("escape"))

		expect(log).toEqual(["scroll:1", "scroll:10", "copy", "close"])
	})
})
