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

const CUSTOMER_FIELDS = `
  id
  defaultEmailAddress { emailAddress }
  firstName
  lastName
  defaultPhoneNumber { phoneNumber }
  state
  verifiedEmail
  numberOfOrders
  amountSpent { amount currencyCode }
  image { url }
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
`;

export const CUSTOMERS_QUERY = `#graphql
  query BackendCustomers($first: Int!, $after: String, $query: String) {
    customers(first: $first, after: $after, query: $query, sortKey: UPDATED_AT, reverse: true) {
      edges {
        cursor
        node {
          ${CUSTOMER_FIELDS}
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

const ORDER_FIELDS = `
  id
  name
  number
  email
  displayFinancialStatus
  displayFulfillmentStatus
  currencyCode
  subtotalPriceSet { shopMoney { amount currencyCode } }
  totalDiscountsSet { shopMoney { amount currencyCode } }
  totalTaxSet { shopMoney { amount currencyCode } }
  totalPriceSet { shopMoney { amount currencyCode } }
  subtotalLineItemsQuantity
  sourceName
  processedAt
  createdAt
  updatedAt
  cancelledAt
  customer { id }
`;

export const ORDERS_QUERY = `#graphql
  query BackendOrders($first: Int!, $after: String, $query: String) {
    orders(first: $first, after: $after, query: $query, sortKey: UPDATED_AT, reverse: true) {
      edges {
        cursor
        node {
          ${ORDER_FIELDS}
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

export const ORDER_BY_ID_QUERY = `#graphql
  query BackendOrderById($id: ID!) {
    order(id: $id) {
      ${ORDER_FIELDS}
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
          originalUnitPriceSet { shopMoney { amount currencyCode } }
          totalDiscountSet { shopMoney { amount currencyCode } }
          discountedTotalSet { shopMoney { amount currencyCode } }
          originalTotalSet { shopMoney { amount currencyCode } }
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
      ${CUSTOMER_FIELDS}
    }
  }
`;

export const ABANDONED_CHECKOUTS_QUERY = `#graphql
  query BackendAbandonedCheckouts($first: Int!, $after: String, $query: String) {
    abandonedCheckouts(first: $first, after: $after, query: $query, sortKey: CREATED_AT, reverse: true) {
      edges {
        cursor
        node {
          id
          createdAt
          updatedAt
          completedAt
          totalPriceSet { shopMoney { amount currencyCode } }
          subtotalPriceSet { shopMoney { amount currencyCode } }
          customer { id defaultEmailAddress { emailAddress } }
          lineItems(first: 100) {
            nodes {
              id
              title
              variantTitle
              sku
              quantity
              originalUnitPriceSet { shopMoney { amount currencyCode } }
              discountedTotalPriceSet { shopMoney { amount currencyCode } }
              product { id }
              variant { id }
            }
            pageInfo { hasNextPage endCursor }
          }
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

export const ABANDONED_CHECKOUT_LINES_QUERY = `#graphql
  query BackendAbandonedCheckoutLines($id: ID!, $first: Int!, $after: String) {
    node(id: $id) {
      ... on AbandonedCheckout {
        lineItems(first: $first, after: $after) {
          nodes {
            id
            title
            variantTitle
            sku
            quantity
            originalUnitPriceSet { shopMoney { amount currencyCode } }
            discountedTotalPriceSet { shopMoney { amount currencyCode } }
            product { id }
            variant { id }
          }
          pageInfo { hasNextPage endCursor }
        }
      }
    }
  }
`;

export const REFUND_BY_ID_QUERY = `#graphql
  query BackendRefundById($id: ID!) {
    node(id: $id) {
      ... on Refund {
        id
        note
        totalRefundedSet {
          shopMoney { amount currencyCode }
          presentmentMoney { amount currencyCode }
        }
        processedAt
        createdAt
        updatedAt
        order { id currencyCode }
      }
    }
  }
`;
