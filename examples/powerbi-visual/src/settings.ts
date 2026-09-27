import { formattingSettings } from "powerbi-visuals-utils-formattingmodel";

import FormattingSettingsCard = formattingSettings.SimpleCard;
import FormattingSettingsModel = formattingSettings.Model;
import FormattingSettingsSlice = formattingSettings.Slice;

/**
 * The "Accessible chart" card of the format pane. Its name and slice names
 * match the `chart` object in capabilities.json.
 *
 * MAIDR cannot tell from the data view what the chart looks like (a clustered
 * and a stacked column chart receive the same data), so the author says so
 * here, matching the native visual this one sits beside.
 */
class ChartCardSettings extends FormattingSettingsCard {
    chartType = new formattingSettings.AutoDropdown({
        name: "chartType",
        displayName: "Chart type",
        value: "column",
    });

    barMode = new formattingSettings.AutoDropdown({
        name: "barMode",
        displayName: "Bar mode",
        value: "grouped",
    });

    title = new formattingSettings.TextInput({
        name: "title",
        displayName: "Title",
        placeholder: "Announced when the reader enters the chart",
        value: "",
    });

    name = "chart";
    displayName = "Accessible chart";
    slices: FormattingSettingsSlice[] = [this.chartType, this.barMode, this.title];
}

export class VisualFormattingSettingsModel extends FormattingSettingsModel {
    chartCard = new ChartCardSettings();

    cards = [this.chartCard];
}
