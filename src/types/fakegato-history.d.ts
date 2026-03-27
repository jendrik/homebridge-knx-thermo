declare module 'fakegato-history' {
  import type { API } from 'homebridge';

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function fakegato(api: API): any;
  export default fakegato;
}
