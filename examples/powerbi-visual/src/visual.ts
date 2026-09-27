"use strict";

import type { PowerBIBarMode, PowerBIBinding, PowerBIChartType, PowerBIDataPointRef } from "maidr/powerbi";
import { bindPowerBI } from "maidr/powerbi";
import powerbi from "powerbi-visuals-api";
import { FormattingSettingsService } from "powerbi-visuals-utils-formattingmodel";
import "./../style/visual.less";

import { VisualFormattingSettingsModel } from "./settings";

import DataView = powerbi.DataView;
import IVisual = powerbi.extensibility.visual.IVisual;
import IVisualEventService = powerbi.extensibility.IVisualEventService;
import IVisualHost = powerbi.extensibility.visual.IVisualHost;
import ISelectionId = powerbi.visuals.ISelectionId;
import ISelectionManager = powerbi.extensibility.ISelectionManager;
import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;

const CHART_TYPES: readonly PowerBIChartType[] = ["column", "bar", "line", "scatter", "pie", "donut"];
const BAR_MODES: readonly PowerBIBarMode[] = ["grouped", "stacked"];

/**
 * Turns a data point MAIDR reports into a Power BI selection id, as
 * docs/powerbi.md ("Highlighting and Cross-Highlighting") describes.
 */
function selectionIdFor(host: IVisualHost, dataView: DataView, ref: PowerBIDataPointRef): ISelectionId | null {
    const builder = host.createSelectionIdBuilder();
    if (ref.kind === "table") {
        return dataView.table ? builder.withTable(dataView.table, ref.rowIndex).createSelectionId() : null;
    }
    const categorical = dataView.categorical;
    if (categorical === undefined) {
        return null;
    }
    if (ref.categoryIndex !== null && categorical.categories?.[0]) {
        builder.withCategory(categorical.categories[0], ref.categoryIndex);
    }
    const column = ref.valueColumnIndex !== null ? categorical.values?.[ref.valueColumnIndex] : undefined;
    if (categorical.values && column) {
        if (categorical.values.source) {
            // Only when a Legend field is bound.
            builder.withSeries(categorical.values, column);
        }
        if (column.source.queryName) {
            builder.withMeasure(column.source.queryName);
        }
    }
    return builder.createSelectionId();
}

/**
 * A companion visual: it draws no chart of its own. The report author places
 * it beside a native Power BI chart and binds the same fields, and a keyboard
 * or screen-reader user tabs into it to hear, navigate and braille that data.
 * Moving through the data selects the matching data point, so Power BI
 * cross-highlights the native chart and the rest of the page.
 */
export class Visual implements IVisual {
    private readonly host: IVisualHost;
    private readonly element: HTMLElement;
    private readonly events: IVisualEventService;
    private readonly selectionManager: ISelectionManager;
    private readonly formattingSettingsService = new FormattingSettingsService();
    private formattingSettings = new VisualFormattingSettingsModel();
    private readonly maidr: PowerBIBinding;
    private dataView: DataView | undefined;

    constructor(options: VisualConstructorOptions) {
        this.host = options.host;
        this.element = options.element;
        this.events = options.host.eventService;
        this.selectionManager = options.host.createSelectionManager();

        this.maidr = bindPowerBI(options.element, {
            chartType: "column",
            barMode: "grouped",
            emptyLabel: "No data to read. Add fields to Axis and Values.",
            onNavigate: points => this.select(points),
        });

        // With "supportsKeyboardFocus", Enter on the visual's container moves
        // focus into this frame, but not necessarily onto a focusable element.
        // Microsoft recommends focusing the first one: MAIDR's figure, or the
        // empty state when there is no data.
        window.addEventListener("focus", this.onWindowFocus);
    }

    public update(options: VisualUpdateOptions): void {
        this.events.renderingStarted(options);
        try {
            this.dataView = options.dataViews?.[0];
            this.formattingSettings = this.formattingSettingsService.populateFormattingSettingsModel(
                VisualFormattingSettingsModel,
                this.dataView as DataView,
            );
            const card = this.formattingSettings.chartCard;
            const title = card.title.value.trim();
            this.maidr.update(this.dataView, {
                chartType: oneOf(CHART_TYPES, card.chartType.value, "column"),
                barMode: oneOf(BAR_MODES, card.barMode.value, "grouped"),
                // An empty title would blank the entry point's visible label.
                title: title === "" ? undefined : title,
            });
            this.events.renderingFinished(options);
        } catch (error) {
            this.events.renderingFailed(options, String(error));
        }
    }

    public getFormattingModel(): powerbi.visuals.FormattingModel {
        return this.formattingSettingsService.buildFormattingModel(this.formattingSettings);
    }

    public destroy(): void {
        window.removeEventListener("focus", this.onWindowFocus);
        this.maidr.dispose();
    }

    private readonly onWindowFocus = (): void => {
        const active = document.activeElement;
        if (active === null || active === document.body) {
            this.element.querySelector<HTMLElement>("[data-maidr-powerbi] [tabindex]")?.focus();
        }
    };

    private select(points: readonly PowerBIDataPointRef[] | null): void {
        // Reading a report that does not allow interactions (a dashboard tile,
        // for one) still works; it just leaves the rest of the page alone.
        if (!this.host.hostCapabilities.allowInteractions) {
            return;
        }
        const dataView = this.dataView;
        const ids = dataView === undefined
            ? []
            : (points ?? [])
                .map(ref => selectionIdFor(this.host, dataView, ref))
                .filter((id): id is ISelectionId => id !== null);
        // `null` (the reader left) and a gap (no data points) both clear.
        void (ids.length > 0 ? this.selectionManager.select(ids) : this.selectionManager.clear());
    }
}

function oneOf<T extends string>(allowed: readonly T[], value: unknown, fallback: T): T {
    return allowed.find(item => item === value) ?? fallback;
}
