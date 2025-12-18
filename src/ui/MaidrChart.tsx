import type { Maidr } from '@type/grammar';
import type { Root } from 'react-dom/client';
import { DomEventType } from '@type/event';
import { Constant } from '@util/constant';
import React, { useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { Controller } from '../controller';
import { MaidrApp } from './App';

/**
 * Props for the MaidrChart component.
 */
export interface MaidrChartProps {
  /**
   * The MAIDR data structure containing chart metadata and data.
   */
  maidrData: Maidr;
  /**
   * The SVG element or HTML element containing the chart visualization.
   * Can be provided as a React ref callback, a ref object, or rendered as children.
   */
  children?: React.ReactNode;
}

/**
 * A React component wrapper for MAIDR that provides accessible chart navigation.
 *
 * This component wraps a chart visualization (SVG) and adds MAIDR's accessibility
 * features including keyboard navigation, audio feedback, and screen reader support.
 *
 * @example
 * ```tsx
 * import { MaidrChart } from 'maidr';
 *
 * const barData = {
 *   id: "my-bar-chart",
 *   title: "Sales by Quarter",
 *   subplots: [[{
 *     layers: [{
 *       id: "0",
 *       type: "bar",
 *       axes: { x: "Quarter", y: "Sales" },
 *       data: [
 *         { x: "Q1", y: 100 },
 *         { x: "Q2", y: 150 },
 *         { x: "Q3", y: 120 },
 *         { x: "Q4", y: 180 }
 *       ]
 *     }]
 *   }]]
 * };
 *
 * function App() {
 *   return (
 *     <MaidrChart maidrData={barData}>
 *       <svg id="my-bar-chart" viewBox="0 0 400 300">
 *         {/* Your chart SVG content *\/}
 *       </svg>
 *     </MaidrChart>
 *   );
 * }
 * ```
 */
export const MaidrChart: React.FC<MaidrChartProps> = ({ maidrData, children }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<Controller | null>(null);
  const reactRootRef = useRef<Root | null>(null);
  const hasAnnouncedRef = useRef(false);
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container)
      return;

    // Find the plot element (SVG or element with matching id)
    const plot = container.querySelector<HTMLElement>(`#${maidrData.id}`)
      || container.querySelector<HTMLElement>('svg')
      || container.firstElementChild as HTMLElement;

    if (!plot) {
      console.error('MaidrChart: No plot element found. Ensure your SVG has id matching maidrData.id');
      return;
    }

    // Create figure wrapper
    const figureElement = document.createElement(Constant.FIGURE);
    figureElement.id = `${Constant.MAIDR_FIGURE}-${maidrData.id}`;
    plot.parentNode?.replaceChild(figureElement, plot);
    figureElement.appendChild(plot);

    // Create article wrapper
    const articleElement = document.createElement(Constant.ARTICLE);
    articleElement.id = `${Constant.MAIDR_ARTICLE}-${maidrData.id}`;
    figureElement.parentNode?.replaceChild(articleElement, figureElement);
    articleElement.appendChild(figureElement);

    // Create React container for MAIDR UI components
    const reactContainer = document.createElement(Constant.DIV);
    reactContainer.id = `${Constant.REACT_CONTAINER}-${maidrData.id}`;
    figureElement.appendChild(reactContainer);

    // Mount MAIDR React app
    const reactRoot = createRoot(reactContainer, { identifierPrefix: maidrData.id });
    reactRoot.render(MaidrApp(plot));
    reactRootRef.current = reactRoot;

    const maidrContainer = figureElement;

    const onFocusOut = (): void => {
      setTimeout(() => {
        const activeElement = document.activeElement as HTMLElement;
        const isInside = maidrContainer.contains(activeElement);
        if (!isInside) {
          if (controllerRef.current) {
            controllerRef.current.dispose();
          }
          controllerRef.current = null;
          hasAnnouncedRef.current = false;
        }
      }, 0);
    };

    const onFocusIn = (): void => {
      setTimeout(() => {
        if (!controllerRef.current) {
          // Create a deep copy to prevent mutations on the original maidr object
          const maidrClone = JSON.parse(JSON.stringify(maidrData)) as Maidr;
          controllerRef.current = new Controller(maidrClone, plot);
        }
        if (!hasAnnouncedRef.current) {
          hasAnnouncedRef.current = true;
          controllerRef.current.showInitialInstructionInText();
        }
      }, 0);
    };

    const onVisibilityChange = (): void => {
      if (document.visibilityState === 'visible') {
        if (controllerRef.current) {
          controllerRef.current.dispose();
          controllerRef.current = null;
        }
        const maidrClone = JSON.parse(JSON.stringify(maidrData)) as Maidr;
        controllerRef.current = new Controller(maidrClone, plot);
        hasAnnouncedRef.current = false;
      }
    };

    plot.addEventListener(DomEventType.FOCUS_IN, onFocusIn);
    maidrContainer.addEventListener(DomEventType.FOCUS_OUT, onFocusOut);
    document.addEventListener(DomEventType.VISIBILITY_CHANGE, onVisibilityChange);

    // Initialize controller once to set up the model (then dispose)
    (() => {
      const maidrClone = JSON.parse(JSON.stringify(maidrData)) as Maidr;
      const initController = new Controller(maidrClone, plot);
      initController.dispose();
    })();

    // Store cleanup function
    cleanupRef.current = () => {
      plot.removeEventListener(DomEventType.FOCUS_IN, onFocusIn);
      maidrContainer.removeEventListener(DomEventType.FOCUS_OUT, onFocusOut);
      document.removeEventListener(DomEventType.VISIBILITY_CHANGE, onVisibilityChange);

      if (controllerRef.current) {
        controllerRef.current.dispose();
        controllerRef.current = null;
      }

      if (reactRootRef.current) {
        reactRootRef.current.unmount();
        reactRootRef.current = null;
      }
    };

    return () => {
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
    };
  }, [maidrData]);

  return (
    <div ref={containerRef}>
      {children}
    </div>
  );
};

export default MaidrChart;
