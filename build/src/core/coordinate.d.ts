export default interface Coordinate {
    x(): number | string;
    y(): number | string;
    z?(): number | string;
}
