import { Router } from 'express';
import { Classes } from '../models/Classes';
import { Class } from '../models/Class';
import { DEFAULT_AVERAGE_CALCULATION_SPECIFICATION } from '../models/AverageCalculationSpecification';
import { badRequest, notFound } from './HttpError';
import { isInteger, isNonEmptyString } from './validation';

/**
 * Routes for creating, listing, updating and removing classes.
 * Mounted at /api/classes.
 *
 * @param classes the class collection to operate on
 * @param onStateChanged called after every successful modification
 */
interface ClassFields {
  topic: string;
  semester: number;
  year: number;
}

/** Checks that a request body carries the fields that identify a class. */
function requireClassFields(body: any): ClassFields {
  const { topic, semester, year } = body;
  if (!topic || !semester || !year) {
    throw badRequest('Topic, semester, and year are required');
  }
  if (!isNonEmptyString(topic)) {
    throw badRequest('Topic must be a non-empty string');
  }
  if (!isInteger(semester) || !isInteger(year)) {
    throw badRequest('Semester and year must be integers');
  }
  return { topic, semester, year };
}

export function classRoutes(classes: Classes, onStateChanged: () => void): Router {
  const router = Router();

  // GET /api/classes - Get all classes
  router.get('/', (req, res) => {
    const allClasses = classes.getAllClasses();

    res.json(allClasses.map(currentClass => {
      const classData = currentClass.toJSON();
      const earlierOfferings = allClasses.filter(offering =>
        offering.getTopic() === currentClass.getTopic() &&
        (
          offering.getYear() < currentClass.getYear() ||
          (
            offering.getYear() === currentClass.getYear() &&
            offering.getSemester() < currentClass.getSemester()
          )
        )
      );

      return {
        ...classData,
        enrollments: classData.enrollments.map(enrollment => ({
          ...enrollment,
          priorFailureCount: earlierOfferings.filter(offering =>
            offering.findEnrollmentByStudentCPF(enrollment.student.cpf.replace(/\D/g, ''))
          ).length,
        })),
      };
    }));
  });

  // POST /api/classes - Add a new class
  router.post('/', (req, res) => {
    const { topic, semester, year } = requireClassFields(req.body);
    const newClass = classes.addClass(new Class(topic, semester, year, DEFAULT_AVERAGE_CALCULATION_SPECIFICATION));
    onStateChanged();
    res.status(201).json(newClass.toJSON());
  });

  // PUT /api/classes/:id - Update a class
  router.put('/:id', (req, res) => {
    const { topic, semester, year } = requireClassFields(req.body);
    if (!classes.findClassById(req.params.id)) {
      throw notFound('Class not found');
    }
    const updatedClass = classes.updateClassIdentification(req.params.id, topic, semester, year);
    onStateChanged();
    res.json(updatedClass.toJSON());
  });

  // DELETE /api/classes/:id - Delete a class
  router.delete('/:id', (req, res) => {
    const removed = classes.removeClass(req.params.id);
    if (!removed) {
      throw notFound('Class not found');
    }
    onStateChanged();
    res.status(204).send();
  });

  return router;
}
