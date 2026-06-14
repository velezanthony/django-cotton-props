import * as vscode from 'vscode';
import { isCottonFile } from '../../scanner';
import { isSupportedLanguage } from '../../constants';
import type { UsageIndex } from '../../usage-index';
import {
    checkDuplicateProps,
    checkPropsMissingFromCVars,
    checkDefaultConsistency,
    checkUndocumentedProps,
    checkUnusedProps,
    extractCVarsInfo,
} from './component-file-checks';
import {
    checkDynamicPrefixMismatch,
    checkEnumDefaultOutOfRange,
    checkMissingCVars,
    checkMissingDescription,
    checkRequiredWithDefault,
    checkTypeDefaultMismatch,
} from './rules';
import { validateComponentUsage } from './usage-checks';

export class DiagnosticProvider {
    constructor(
        private collection: vscode.DiagnosticCollection,
        private usageIndex?: UsageIndex,
    ) {}

    async update(document: vscode.TextDocument) {
        if (!isSupportedLanguage(document.languageId)) { return; }

        const diagnostics: vscode.Diagnostic[] = [];
        const text = document.getText();

        if (this.usageIndex) { await this.usageIndex.ready; }

        if (isCottonFile(document.uri)) {
            // Unused-component status lives in the Cotton sidebar tree
            // (per-component badge), not as a file-level diagnostic.

            const { diagnostics: dupDiags, seenDefs } = checkDuplicateProps(document, text);
            diagnostics.push(...dupDiags);

            const cvars = extractCVarsInfo(document, text);
            if (cvars) {
                diagnostics.push(...checkPropsMissingFromCVars(document, seenDefs, cvars));
                diagnostics.push(...checkDefaultConsistency(document, seenDefs, cvars));
                diagnostics.push(...checkUndocumentedProps(document, seenDefs, cvars));
                diagnostics.push(...checkUnusedProps(document, cvars, text));
            }

            // Parity-with-gallery rules.
            diagnostics.push(...checkRequiredWithDefault(document, text));
            diagnostics.push(...checkTypeDefaultMismatch(document, text));
            diagnostics.push(...checkEnumDefaultOutOfRange(document, text));
            diagnostics.push(...checkDynamicPrefixMismatch(document, text));
            diagnostics.push(...checkMissingCVars(document, text));
            diagnostics.push(...checkMissingDescription(document, text));
        }

        diagnostics.push(...validateComponentUsage(document, text));

        this.collection.set(document.uri, diagnostics);
    }
}
