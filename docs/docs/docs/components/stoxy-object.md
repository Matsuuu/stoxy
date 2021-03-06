# Components >> Stoxy Object

Stoxy Object is a web component used for sections of content, where you want to
access multiple keys of a single state object.

This can be useful for example when generating user profile pages.

As with all of Stoxy elements, Stoxy Object also updates it's contents automatically
as the state changes. No action needed from the developer side.

```js script
import '@rocket/launch/inline-notification/inline-notification.js';
```

<inline-notification type="tip" title="Reactivity">

As with all of Stoxy elements, Stoxy Object also updates it's contents automatically
as the state changes. No action needed from the developer side.

</inline-notification>

### Attributes

| Name   | Attribute                                                                                                           |
| ------ | ------------------------------------------------------------------------------------------------------------------- |
| key    | Key in string form. Used as the name of the state object                                                            |
| prefix | Prefix to access wanted state object properties. Makes it possible for Stoxy to recognize plain strings to replace. |

### Events

| Name    | Attribute                                                                                                                |
| ------- | ------------------------------------------------------------------------------------------------------------------------ |
| updated | Triggers when the state object observed by the stoxy element is updated. Event detail contains data about the new state. |

### Usage

With a state object of

```js copy
import '@stoxy/object';
import { write } from 'stoxy';

const userData = {
    name: 'Matsuuu',
    favoriteAnimal: 'Cats',
    country: {
        countryName: 'Finland',
        countryCode: 'FI',
    },
};

write('user', userData);
```

we could do:

```html copy
<stoxy-object key="user-data" prefix="u.">
    <h1>Hello, World!</h1>

    <p>My name is: u.name, and I'm from u.country.countryName (u.country.countryCode).</p>
    <p>My favorite animal is: u.favoriteAnimal</p>
</stoxy-object>
```

And end up with

```html copy
<stoxy-object key="user-data" prefix="u.">
    <h1>Hello, World!</h1>

    <p>My name is: Matsu, and I'm from Finland (FI).</p>
    <p>My favorite animal is: Cats</p>
</stoxy-object>
```
