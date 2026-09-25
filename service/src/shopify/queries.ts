export const PRODUCTS_QUERY = `#graphql
  query BackendProducts($first: Int!, $after: String, $query: String) {
    products(first: $first, after: $after, query: $query, sortKey: UPDATED_AT, reverse: true) {
      edges {
        cursor
        node {
          id
          title
          handle
          descriptionHtml
          vendor
          productType
          category { name fullName }
          status
          tags
          totalInventory
          onlineStoreUrl
          publishedAt
          createdAt
          updatedAt
          featuredImage { url }
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

export const PRODUCT_VARIANTS_QUERY = `#graphql
  query BackendProductVariants($productId: ID!, $first: Int!, $after: String) {
    product(id: $productId) {
      variants(first: $first, after: $after) {
        edges {
          cursor
          node {
            id
            title
            position
            image { url }
            selectedOptions { name value }
            sku
            barcode
            price
            compareAtPrice
            inventoryQuantity
            inventoryPolicy
            taxable
          }
        }
        pageInfo { hasNextPage endCursor }
      }
    }
  }
`;

export const CUSTOMERS_QUERY = `#graphql
  query BackendCustomers($first: Int!, $after: String, $query: String) {
    customers(first: $first, after: $after, query: $query, sortKey: UPDATED_AT, reverse: true) {
      edges {
        cursor
        node {
          id
          email
          firstName
          lastName
          phone
          state
          verifiedEmail
          ordersCount
          totalSpent
          avatarUrl
          createdAt
          updatedAt
          defaultAddress {
            company
            address1
            address2
            city
            province
            provinceCode
            country
            countryCodeV2
            zip
            phone
          }
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

export const ORDERS_QUERY = `#graphql
  query BackendOrders($first: Int!, $after: String, $query: String) {
    orders(first: $first, after: $after, query: $query, sortKey: UPDATED_AT, reverse: true) {
      edges {
        cursor
        node {
          id
          name
          orderNumber
          email
          financialStatus
          fulfillmentStatus
          currencyCode
          subtotalPrice
          totalDiscounts
          totalTax
          totalPrice
          totalUnits
          sourceName
          processedAt
          createdAt
           updatedAt
           cancelledAt
           customer { id }
         }
       }
       pageInfo { hasNextPage endCursor }
    }
  }
`;

export const ORDER_LINE_ITEMS_QUERY = `#graphql
  query BackendOrderLineItems($orderId: ID!, $first: Int!, $after: String) {
    order(id: $orderId) {
      lineItems(first: $first, after: $after) {
        nodes {
          id
          title
          variantTitle
          sku
          quantity
          originalUnitPrice
          totalDiscount
          totalPrice
          product { id }
          variant { id }
        }
        pageInfo { hasNextPage endCursor }
      }
    }
  }
`;

export const PRODUCT_BY_ID_QUERY = `#graphql
  query BackendProductById($id: ID!) {
    product(id: $id) {
      id
      title
      handle
      descriptionHtml
      vendor
      productType
      category { name fullName }
      status
      tags
      totalInventory
      onlineStoreUrl
      publishedAt
      createdAt
      updatedAt
      featuredImage { url }
    }
  }
`;

export const CUSTOMER_BY_ID_QUERY = `#graphql
  query BackendCustomerById($id: ID!) {
    customer(id: $id) {
      id
      email
      firstName
      lastName
      phone
      state
      verifiedEmail
      ordersCount
      totalSpent
      avatarUrl
      createdAt
      updatedAt
      defaultAddress {
        company
        address1
        address2
        city
        province
        provinceCode
        country
        countryCodeV2
        zip
        phone
      }
    }
  }
`;

export const CART_LINE_ITEMS_QUERY = `#graphql
  query BackendCartLineItems($cartId: ID!, $first: Int!, $after: String) {
    cart(id: $cartId) {
      lines(first: $first, after: $after) {
        nodes {
          id
          quantity
          cost {
            amountPerQuantity { amount currencyCode }
            totalAmount { amount currencyCode }
          }
          merchandise {
            ... on ProductVariant {
              id
              title
              sku
              price
              product { id }
            }
          }
        }
        pageInfo { hasNextPage endCursor }
      }
    }
  }
`;

export const ORDER_BY_ID_QUERY = `#graphql
  query BackendOrderById($id: ID!) {
    order(id: $id) {
      id
      name
      orderNumber
      email
      financialStatus
      fulfillmentStatus
      currencyCode
      subtotalPrice
      totalDiscounts
      totalTax
      totalPrice
      totalUnits
      sourceName
      processedAt
      createdAt
      updatedAt
      cancelledAt
      customer { id }
    }
  }
`;

export const CART_BY_ID_QUERY = `#graphql
  query BackendCartById($id: ID!) {
    cart(id: $id) {
      id
      createdAt
      updatedAt
      completedAt
      totalQuantity
      customer { id }
      cost {
        subtotalAmount { amount currencyCode }
        totalAmount { amount currencyCode }
      }
    }
  }
`;

export const CHECKOUT_BY_ID_QUERY = `#graphql
  query BackendCheckoutById($id: ID!) {
    checkout(id: $id) {
      id
      createdAt
      updatedAt
      completedAt
      email
      totalQuantity
      customer { id }
      cart { id }
      cost {
        subtotalAmount { amount currencyCode }
        totalAmount { amount currencyCode }
      }
    }
  }
`;

export const REFUND_BY_ID_QUERY = `#graphql
  query BackendRefundById($id: ID!) {
    refund(id: $id) {
      id
      note
      totalAmount { amount currencyCode }
      processedAt
      createdAt
      updatedAt
      order { id currencyCode }
    }
  }
`;

export const CARTS_QUERY = `#graphql
  query BackendCarts($first: Int!, $after: String, $query: String) {
    carts(first: $first, after: $after, query: $query) {
      edges {
        cursor
        node {
          id
          createdAt
          updatedAt
          completedAt
          totalQuantity
          customer { id }
          cost {
            subtotalAmount { amount currencyCode }
            totalAmount { amount currencyCode }
          }
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

export const CHECKOUTS_QUERY = `#graphql
  query BackendCheckouts($first: Int!, $after: String, $query: String) {
    checkouts(first: $first, after: $after, query: $query, sortKey: UPDATED_AT, reverse: true) {
      edges {
        cursor
        node {
          id
          createdAt
          updatedAt
          completedAt
          email
          totalQuantity
          customer { id }
          cart { id }
          cost {
            subtotalAmount { amount currencyCode }
            totalAmount { amount currencyCode }
          }
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;
