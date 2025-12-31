/**
 * GraphQL Resolvers Index
 *
 * Combines all resolver modules into a single resolver object
 */

import { queryResolvers } from './query.resolvers';
import { mutationResolvers } from './mutation.resolvers';
import { typeResolvers } from './type.resolvers';

/**
 * Combined resolvers object for Apollo Server
 */
export const resolvers = {
  ...queryResolvers,
  ...mutationResolvers,
  ...typeResolvers,
};
