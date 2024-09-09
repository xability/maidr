export function slideBetween(
  val: number,
  a: number,
  b: number,
  min: number,
  max: number
): number {
  val = Number(val);
  a = Number(a);
  b = Number(b);
  min = Number(min);
  max = Number(max);

  let newVal = ((val - a) / (b - a)) * (max - min) + min;

  if (a === 0 && b === 0) {
    newVal = 0;
  }

  return newVal;
}
