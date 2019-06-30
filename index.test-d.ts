import { expectType } from 'tsd';
import isIncognito from '.';

expectType<boolean>(await isIncognito());
