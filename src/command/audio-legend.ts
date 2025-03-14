import type { AudioService } from '@service/audio';
import type { Command } from './command';
import type { Plot } from '@type/plot';

/**
 * Command to play an audio legend demonstrating the different sounds for each data group
 * Used in multi-line plots and stacked bar plots to help users distinguish between groups
 */
export class PlayAudioLegendCommand implements Command {
    private readonly audio: AudioService;
    private readonly plot: Plot;

    /**
     * Creates a new PlayAudioLegendCommand
     *
     * @param audio - The audio service to use for playing the legend
     * @param plot - The plot to get data series/group count from
     */
    public constructor(audio: AudioService, plot: Plot) {
        this.audio = audio;
        this.plot = plot;
    }

    /**
     * Executes the command to play an audio legend
     * Determines the number of groups in the plot and plays a distinct sound for each
     */
    public execute(): void {
        const state = this.plot.state;

        // If the plot is empty, there's nothing to play
        if (state.empty) {
            return;
        }

        // For multi-line plots, the number of groups is the length of the values array
        // For stacked bar plots, we use the same approach
        const groupCount = state.empty ? 0 :
            (Array.isArray(state.audio.value) ?
                state.audio.value.length :
                (state.audio.groupIndex !== undefined ? state.audio.groupIndex + 1 : 1));

        // Play the audio legend with the determined number of groups
        this.audio.playAudioLegend(Math.max(1, groupCount));
    }
}
