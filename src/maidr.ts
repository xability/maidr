export default interface Maidr {
  id: string;
  type: string;
  selector?: string;
  title?: string;
  axes: {
    x: {
      label?: string;
      level?: Array<string>;
    };
    y: {
      label?: string;
      level?: Array<string>;
    };
  };
  data: any;
}
