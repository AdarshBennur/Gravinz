/** @type {import('ts-jest').JestConfigWithTsJest} */
export default {
    preset: 'ts-jest/presets/default-esm', // Use ESM preset
    testEnvironment: 'node',
    moduleNameMapper: {
        '^(\\.{1,2}/.*)\\.js$': '$1', // Handle .js extensions in ESM imports
    },
    transform: {
        '^.+\\.tsx?$': ['ts-jest', {
            useESM: true, // Tell ts-jest to handle ESM
        }],
    },
    extensionsToTreatAsEsm: ['.ts'],
};
