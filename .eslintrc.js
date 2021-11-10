module.exports = {
    "env": {
        "browser": true,
        "commonjs": true,
        "es2021": true
    },
    "extends": [
        "standard", 'eslint:recommended'
    ],
    "parserOptions": {
        "ecmaVersion": 2018
    },
    rules: {
      // allow async-await
      'generator-star-spacing': 'off',
      // allow paren-less arrow functions
      'arrow-parens': 'off',
      'one-var': 'off',
      'no-void': 'off',
      'multiline-ternary': 'off',
  
      'import/first': 'off',
      'import/named': 'error',
      'import/namespace': 'error',
      'import/default': 'error',
      'import/export': 'error',
      'import/extensions': 'off',
      'import/no-unresolved': 'off',
      'import/no-extraneous-dependencies': 'off',
      'prefer-promise-reject-errors': 'off',
  
  
      // allow debugger during development only
      'no-debugger': process.env.NODE_ENV === 'production' ? 'error' : 'off'
    }
};
