# Cockpit API

A package to interact with the Cockpit CMS API, including functionalities to handle GraphQL requests and various CMS content manipulations.
## Installation

Install the package via npm:

```sh
npm install --save @unchainedshop/cockpit-api
```

## Usage

### Initialization

First, import and initialize the API:

```javascript
import { CockpitAPI } from '@unchainedshop/cockpit-api';

const cockpit = await CockpitAPI();
```

### GraphQL Requests

You can make GraphQL requests using the `graphQL` method:

```javascript
import { gql } from 'graphql-tag';

const query = gql`
  query {
    allPosts {
      title
      content
    }
  }
`;

const result = await cockpit.graphQL(query, {});
console.log(result);
```

### Content Operations

You can perform various content operations such as fetching items, aggregating models, and manipulating pages.

Example to get a content item:

```javascript
const contentItem = await cockpit.getContentItem({ model: 'posts', id: '123' });
console.log(contentItem);
```

### CockpitAPI

Provides various methods to interact with the Cockpit CMS.

**Methods:**
- `graphQL(document, variables)`
- `getContentItem({ model, id }, locale, queryParams)`
- `getAggregateModel({ model, pipeline }, locale)`
- `getContentItems(model, locale, queryParams)`
- `getContentTree(model, locale, queryParams)`
- `postContentItem(model, item)`
- `deleteContentItem(model, id)`
- `pages(locale, queryParams)`
- `pageById({ page, id }, locale, queryParams)`
- `pageByRoute(route, locale)`
- `pagesMenus(locale)`
- `pagesMenu(name, locale)`
- `pagesRoutes(locale)`
- `pagesSitemap()`
- `pagesSetting(locale)`

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.

1. Fork the repository.
2. Create a new branch: `git checkout -b feature-branch-name`.
3. Make your changes and commit them: `git commit -m 'Add new feature'`.
4. Push to the branch: `git push origin feature-branch-name`.
5. Open a pull request.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
```

This `README.md` covers installation, basic usage, detailed API reference, contribution guidelines, and licensing information. Adjust the details as needed for your specific implementation.
