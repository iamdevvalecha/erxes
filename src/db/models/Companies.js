import mongoose from 'mongoose';
import { Fields, Customers, ActivityLogs, InternalNotes } from './';
import { field } from './utils';

const CompanySchema = mongoose.Schema({
  _id: field({ pkey: true }),
  name: field({
    type: String,
    label: 'Name',
    unique: true,
  }),

  size: field({
    type: Number,
    label: 'Size',
    optional: true,
  }),

  industry: field({
    type: String,
    label: 'Industry',
    optional: true,
  }),

  website: field({
    type: String,
    label: 'Website',
    optional: true,
  }),

  plan: field({
    type: String,
    label: 'Plan',
    optional: true,
  }),

  lastSeenAt: field({
    type: Date,
    label: 'Last seen at',
  }),

  sessionCount: field({
    type: Number,
    label: 'Session count',
  }),

  tagIds: field({
    type: [String],
    optional: true,
  }),

  customFieldsData: field({
    type: Object,
  }),
});

class Company {
  /**
   * Checking if company has duplicated unique properties
   * @param  {Object} companyFields - Customer fields to check duplications
   * @param  {string[]} idsToExclude - Customer ids to exclude
   * @return {Promise} - Result
   */
  static async checkDuplication(companyFields, idsToExclude) {
    let query = {};

    // Adding exclude operator to the query
    if (idsToExclude) {
      query._id = { $nin: idsToExclude };
    }

    // Checking if company has name
    if (companyFields.name) {
      query.name = companyFields.name;
      const previousEntry = await this.findOne(query);

      // Checking if duplicated
      if (previousEntry) {
        return 'Duplicated Name!';
      }
    }

    return true;
  }

  /**
   * Create a company
   * @param  {Object} companyObj - Object
   * @return {Promise} Newly created company object
   */
  static async createCompany(doc) {
    // Checking duplicated fields of company
    const duplicated = await this.checkDuplication(doc);

    if (duplicated !== true) {
      throw new Error(duplicated);
    }

    // clean custom field values
    doc.customFieldsData = await Fields.cleanMulti(doc.customFieldsData || {});

    return this.create(doc);
  }

  /**
   * Update company
   * @param {String} _id - Company id to update
   * @param {Object} doc - Field values to update
   * @return {Promise} updated company object
   */
  static async updateCompany(_id, doc) {
    // Checking duplicated fields of company
    const duplicated = await this.checkDuplication(doc, [_id]);

    if (duplicated !== true) {
      throw new Error(duplicated);
    }

    // clean custom field values
    doc.customFieldsData = await Fields.cleanMulti(doc.customFieldsData || {});

    await this.update({ _id }, { $set: doc });

    return this.findOne({ _id });
  }

  /**
   * Create new customer and add to customer's customer list
   * @return {Promise} newly created customer
   */
  static async addCustomer({ _id, name, email }) {
    // create customer
    return await Customers.createCustomer({
      name,
      email,
      companyIds: [_id],
    });
  }

  /**
   * Update company customers
   * @param {String} _id - Company id to update
   * @param {string[]} customerIds - Customer ids to update
   * @return {Promise} updated company object
   */
  static async updateCustomers(_id, customerIds) {
    // Removing companyIds from users
    await Customers.updateMany({ companyIds: { $in: [_id] } }, { $pull: { companyIds: _id } });

    // Adding companyId to the each customers
    for (let customerId of customerIds) {
      await Customers.findByIdAndUpdate(
        { _id: customerId },
        { $addToSet: { companyIds: _id } },
        { upsert: true },
      );
    }

    return this.findOne({ _id });
  }

  /**
   * Remove company
   * @param {String} companyId - Company id of company to remove
   * @return {Promise} result
   */
  static async removeCompany(companyId) {
    // Removing modules associated with company
    await ActivityLogs.removeCompanyActivityLog(companyId);
    await InternalNotes.removeCompanyInternalNotes(companyId);

    return await this.remove({ _id: companyId });
  }

  /**
   * Merge companies
   * @param {String} companyIds - Company Ids to merge
   * @param {Object} companyFields - Company infos to create with
   * @return {Promise} Newly created company
   */
  static async mergeCompanies(companyIds, companyFields) {
    let tagIds = [];

    // Checking duplicated fields of company
    const duplicated = await this.checkDuplication(companyFields, companyIds);

    if (duplicated !== true) {
      throw new Error(duplicated);
    }

    // Merging company tags
    for (let companyId of companyIds) {
      const company = await this.findOne({ _id: companyId });
      const companyTags = company.tagIds || [];

      // Merging company's tag into 1 array
      tagIds = tagIds.concat(companyTags);

      // Removing company
      await this.remove({ _id: companyId });
    }

    // Creating company with properties
    const company = await this.createCompany({ ...companyFields, tagIds });

    // Updating customer companies
    for (let companyId of companyIds) {
      await Customers.updateMany({ companyIds: companyId }, { $push: { companyIds: company._id } });
      await Customers.updateMany({ companyIds: companyId }, { $pull: { companyIds: companyId } });
    }

    // Removing modules associated with current companies
    await ActivityLogs.changeCompany(company._id, companyIds);
    await InternalNotes.changeCompany(company._id, companyIds);

    return company;
  }
}

CompanySchema.loadClass(Company);

const Companies = mongoose.model('companies', CompanySchema);

export default Companies;
