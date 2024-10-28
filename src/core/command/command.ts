export default interface Command {
  execute(event?: Event): void;
}
